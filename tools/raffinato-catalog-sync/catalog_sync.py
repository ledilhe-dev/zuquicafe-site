from __future__ import annotations
import argparse,base64,ctypes,hashlib,json,logging,os,sys,time,uuid
from ctypes import wintypes
from datetime import datetime,timedelta,timezone
from pathlib import Path
import pyodbc,requests

BASE=Path(sys.executable).resolve().parent if getattr(sys,'frozen',False) else Path(__file__).resolve().parent; CONFIG=BASE/'catalog-sync.dat'; LOG=BASE/'catalog-sync.log'
logging.basicConfig(filename=LOG,level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s',encoding='utf-8')
CONNECTOR_VERSION='2.0.11'
SQL="""SELECT P.Id idproduto,LTRIM(RTRIM(P.Nome)) nome,LTRIM(RTRIM(P.NomeReduzido)) nomereduzido,
CAST(PP.Valor AS decimal(12,2)) preco,NULLIF(LTRIM(RTRIM(P.CodigoBarra)),'') codigobarra,
U.Sigla unidade,CAST(ISNULL(U.PermiteFracao,0) AS bit) permite_fracao,A.Id idcategoria,
LTRIM(RTRIM(A.Nome)) categoria,A.Arvore arvore,CAST(ISNULL(P.Ativo,0) AS bit) ativo
FROM dbo.Produto P WITH(NOLOCK)
OUTER APPLY (SELECT TOP(1) X.Valor FROM dbo.PrecoProduto X WITH(NOLOCK)
 WHERE X.IdProduto=P.Id AND X.IdFilial=? AND (X.DataInicial IS NULL OR X.DataInicial<=GETDATE())
 AND (X.DataFinal IS NULL OR X.DataFinal>=GETDATE()) ORDER BY ISNULL(X.DataInicial,'19000101') DESC,X.Id DESC) PP
LEFT JOIN dbo.UnidadeMedida U WITH(NOLOCK) ON U.Id=P.IdUnidadeMedida
LEFT JOIN dbo.Agrupamento A WITH(NOLOCK) ON A.Id=P.IdAgrupamento
WHERE ISNULL(LTRIM(RTRIM(P.Nome)),'')<>'' ORDER BY P.Id"""
class BLOB(ctypes.Structure):_fields_=[('cbData',wintypes.DWORD),('pbData',ctypes.POINTER(ctypes.c_char))]
def protect(raw:bytes)->bytes:
 b=BLOB(len(raw),ctypes.cast(ctypes.create_string_buffer(raw),ctypes.POINTER(ctypes.c_char)));o=BLOB();ctypes.windll.crypt32.CryptProtectData(ctypes.byref(b),None,None,None,None,0,ctypes.byref(o));data=ctypes.string_at(o.pbData,o.cbData);ctypes.windll.kernel32.LocalFree(o.pbData);return data
def unprotect(raw:bytes)->bytes:
 b=BLOB(len(raw),ctypes.cast(ctypes.create_string_buffer(raw),ctypes.POINTER(ctypes.c_char)));o=BLOB();ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(b),None,None,None,None,0,ctypes.byref(o));data=ctypes.string_at(o.pbData,o.cbData);ctypes.windll.kernel32.LocalFree(o.pbData);return data
def load():return json.loads(unprotect(base64.b64decode(CONFIG.read_bytes())).decode())
def save(c):CONFIG.write_bytes(base64.b64encode(protect(json.dumps(c).encode())))
def connection(c):
 driver=str(c['driver']).strip('{}')
 return f"DRIVER={{{driver}}};SERVER={c['server']};DATABASE={c['database']};UID={c['uid']};PWD={c['pwd']};Encrypt=no;TrustServerCertificate=yes;ApplicationIntent=ReadOnly;"
def rows(c):
 with pyodbc.connect(connection(c),timeout=8) as db:
  cur=db.cursor();cur.execute(SQL,int(c['id_filial']));names=[d[0] for d in cur.description]
  return [dict(zip(names,r)) for r in cur.fetchall()]
def post(c,action,**body):
 r=requests.post(c['backend_url'],headers={'content-type':'application/json','x-catalog-token':c['sync_token']},json={'action':action,'id_filial':int(c['id_filial']),'connector_version':CONNECTOR_VERSION,**body},timeout=45);r.raise_for_status();return r.json()
def test_connection(c):
 with pyodbc.connect(connection(c),timeout=8) as db:
  cur=db.cursor();cur.execute("SELECT (SELECT COUNT_BIG(*) FROM dbo.Produto WITH(NOLOCK)),(SELECT COUNT_BIG(*) FROM dbo.Agrupamento WITH(NOLOCK))");counts=cur.fetchone()
 return post(c,'catalog_sync_connection_test',product_count=int(counts[0]),group_count=int(counts[1]))
def build_order_payload(source,now=None):
 now=now or datetime.now(timezone(timedelta(hours=-3))).replace(tzinfo=None,microsecond=0).isoformat();guid=source['guid']
 integration_guid=str(uuid.uuid5(uuid.NAMESPACE_URL,'zuqui-order:'+guid));items=[]
 for item in source['items']:
  quantity=float(item['quantity']);price=float(item['unit_price']);observation=str(item.get('observation') or item.get('observacao') or '').strip()[:200]
  items.append({'idproduto':int(item['raffinato_product_id']),'nomereduzido':str(item.get('name') or ''),'valor':price,'valorvariacao':None,'arvore':item.get('category_tree'),'unidademedida':str(item.get('unit') or 'UN'),'codigobarra':item.get('barcode'),'observacao':observation,'permitevendafracionada':bool(item.get('allows_fractional',False)),'idgarcom':int(source['waiter_id']),'quantidade':quantity,'valorunitario':price,'valortotal':round(quantity*price,2),'datahora':now,'identificadorintegracao':integration_guid,'porcoespadrao':[]})
 return {'isOldOrder':False,'identificador':guid,'idgarcom':int(source['waiter_id']),'setorimpressao':int(source['print_sector_id']),'pedido':{'datahora':now,'nomereferencia':source['reference'],'ocupantes':1,'identificadorpedidointegracao':integration_guid,'observacao':'','itens':items},'cartaoconsumo':{'nomecliente':str(source['card_code']),'codigovirtual':str(source['card_code'])}}
def dispatch_order(c):
 if not c.get('raffinato_api_url') or not c.get('raffinato_api_auth'):
  return False
 queued=post(c,'catalog_sync_order_pending').get('order')
 if not queued:return False
 source=queued['request_payload'];payload=build_order_payload(source);guid=source['guid']
 endpoint=c['raffinato_api_url'].rstrip('/')+'/integracao/recebepedidos'
 try:
  # O Raffinato pode levar mais de 20 s e concluir mesmo depois do timeout.
  # A margem maior evita informar falha ao cliente para um pedido que foi gravado.
  response=requests.post(endpoint,headers={'Authorization':c['raffinato_api_auth'],'Content-Type':'application/json'},json=payload,timeout=60)
  try: result=response.json()
  except Exception: result={'resposta_nao_json':True}
  confirmed=(result.get('result') or [{}])[0] if isinstance(result.get('result'),list) else result
  reported=dict(result) if isinstance(result,dict) else {'result':result};reported['_zuqui_connector_version']=CONNECTOR_VERSION
  post(c,'catalog_sync_order_result',order_id=queued['id'],http_status=response.status_code,result=reported,error=None if response.ok and confirmed.get('gravado') is True else 'A API nao confirmou gravado: true')
 except requests.Timeout:
  post(c,'catalog_sync_order_result',order_id=queued['id'],timed_out=True,result={},error='timeout')
 except Exception as exc:
  post(c,'catalog_sync_order_result',order_id=queued['id'],result={},error=str(exc)[:500])
 return True
def sync(c,mode='full',dry=False,request_id=None):
 products=rows(c);payload=[]
 for p in products:
  x={k:(float(v) if k=='preco' and v is not None else bool(v) if k in ('ativo','permite_fracao') else v) for k,v in p.items()};x['fingerprint']=hashlib.sha256(json.dumps(x,sort_keys=True,default=str).encode()).hexdigest();payload.append(x)
 if dry:return payload
 run=post(c,'catalog_sync_start',mode=mode,request_id=request_id)['run_id']
 try:
  for i in range(0,len(payload),200):post(c,'catalog_sync_batch',run_id=run,products=payload[i:i+200])
  return post(c,'catalog_sync_finish',run_id=run,mode=mode)
 except Exception as e:post(c,'catalog_sync_fail',run_id=run,error=str(e)[:1000]);raise
def setup():
 from getpass import getpass
 p=BASE/'config.example.json';c=json.loads(p.read_text(encoding='utf-8'));print('Edite os dados não secretos agora.');
 for k in ('server','database','uid','id_filial','store_key','backend_url','interval_minutes'):
  v=input(f"{k} [{c[k]}]: ").strip();c[k]=int(v) if v and k in ('id_filial','interval_minutes') else (v or c[k])
 c['pwd']=getpass('Senha SQL somente leitura: ');c['sync_token']=getpass('Token do sincronizador: ');save(c);print('Configuração protegida pelo usuário do Windows.')
def setup_orders():
 from getpass import getpass
 c=load();current=c.get('raffinato_api_url','http://26.61.114.43:10060/raffinato/api');value=input(f"URL da API Raffinato [{current}]: ").strip();c['raffinato_api_url']=value or current
 credential=getpass('Credencial completa Basic gerada pelo Raffinato: ').strip()
 if not credential.startswith('Basic '):raise ValueError('A credencial deve iniciar com Basic e nao sera recodificada.')
 c['raffinato_api_auth']=credential;save(c);print('API protegida por DPAPI. A credencial nao foi exibida nem registrada em log.')
def main():
 a=argparse.ArgumentParser();a.add_argument('--setup',action='store_true');a.add_argument('--setup-orders',action='store_true');a.add_argument('--once',action='store_true');a.add_argument('--dry-run',action='store_true');a.add_argument('--test-connection',action='store_true');args=a.parse_args()
 if args.setup:return setup()
 if args.setup_orders:return setup_orders()
 c=load()
 if args.dry_run:
  data=sync(c,dry=True);print(json.dumps({'count':len(data),'examples':data[:5]},ensure_ascii=False,default=str,indent=2));return
 if args.test_connection:
  print(json.dumps(test_connection(c),ensure_ascii=False));return
 next_periodic=0
 while True:
  try:logging.info('sync start');result=sync(c);logging.info('sync ok %s',result)
  except Exception:logging.exception('sync failed')
  if args.once:return
  next_periodic=time.time()+max(1,int(c.get('interval_minutes',15)))*60
  while time.time()<next_periodic:
   try:
    pending=post(c,'catalog_sync_pending')
    if pending.get('request_id'):
     logging.info('manual sync %s',pending['request_id']);sync(c,request_id=pending['request_id']);next_periodic=time.time()+max(1,int(c.get('interval_minutes',15)))*60
    dispatch_order(c)
   except Exception:logging.exception('manual sync poll failed')
   time.sleep(5)
if __name__=='__main__':main()
