import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../supabase/functions/cardapio-api/index.ts',import.meta.url),'utf8');

function sync(existing,sourceAvailable=true){
  if(!existing)return {source_available:sourceAvailable,available:sourceAvailable,cardapio_override:false,visible:false};
  return {...existing,source_available:sourceAvailable,available:sourceAvailable};
}

test('lote separa cadastros novos antes de inserir',()=>{
  assert.match(source,/existingRows = rows\.filter/);
  assert.match(source,/newRows = rows[\s\S]*?cardapio_override: false,[\s\S]*?visible: false/);
  assert.match(source,/upsert\(existingRows/);
  assert.match(source,/insert\(newRows\)/);
});

test('produto novo entra oculto mesmo ativo no Raffinato',()=>{
  assert.deepEqual(sync(null,true),{source_available:true,available:true,cardapio_override:false,visible:false});
});

test('produto ativo e produto desativado manualmente preservam o override',()=>{
  assert.equal(sync({cardapio_override:true,visible:true}).cardapio_override,true);
  assert.equal(sync({cardapio_override:false,visible:false}).cardapio_override,false);
});
