import importlib.util
import sys
import types
import unittest
from pathlib import Path

for name in ('pyodbc', 'requests'):
    sys.modules.setdefault(name, types.ModuleType(name))

spec = importlib.util.spec_from_file_location('catalog_sync', Path(__file__).with_name('catalog_sync.py'))
catalog_sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog_sync)


class OrderPayloadTests(unittest.TestCase):
    def test_keeps_each_observation_on_its_own_raffinato_item(self):
        source = {'guid':'4cb26087-b330-4a1f-870c-e4cb122602e3','waiter_id':20,'reference':'MESA 01','print_sector_id':7,'card_code':'24','items':[
            {'raffinato_product_id':101,'quantity':1,'unit_price':3.99,'observation':'SEM GELO'},
            {'raffinato_product_id':202,'quantity':1,'unit_price':7.50,'observation':'SEM CEBOLA'}]}
        payload = catalog_sync.build_order_payload(source,'2026-10-01T22:00:00-03:00')
        self.assertEqual([item['observacao'] for item in payload['pedido']['itens']],['SEM GELO','SEM CEBOLA'])
        self.assertEqual(payload['pedido']['observacao'],'')
        self.assertEqual(payload['setorimpressao'],7)

    def test_empty_item_does_not_inherit_another_observation(self):
        source = {'guid':'c033c368-739b-4fe3-9262-f251b30870ea','waiter_id':20,'reference':'MESA 01','print_sector_id':3,'card_code':'24','items':[
            {'raffinato_product_id':101,'quantity':1,'unit_price':3.99,'observation':'SEM GELO'},
            {'raffinato_product_id':202,'quantity':1,'unit_price':7.50,'observation':None}]}
        items = catalog_sync.build_order_payload(source,'2026-10-01T22:00:00-03:00')['pedido']['itens']
        self.assertEqual([item['observacao'] for item in items],['SEM GELO',''])


if __name__ == '__main__':
    unittest.main()
