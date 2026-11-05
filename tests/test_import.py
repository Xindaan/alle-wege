import importlib.util, math, unittest, tempfile, json
from pathlib import Path
spec=importlib.util.spec_from_file_location('prepare_data',Path(__file__).parents[1]/'scripts/prepare_data.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ImportTests(unittest.TestCase):
    def test_stream_reader(self):
        obj={'osm3s':{'timestamp_osm_base':'2026-11-02T00:00:00Z'},'elements':[{'type':'node','id':1,'lat':50,'lon':10},{'type':'way','id':2,'nodes':[1],'tags':{'highway':'primary','unused':'discard'}}]}
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'osm.json';p.write_text(json.dumps(obj));meta,coords,ways=m.read_osm(p)
            self.assertEqual(coords,{1:[10,50]});self.assertEqual(ways[0]['tags'],{'highway':'primary'})
            p.write_text(json.dumps(obj)[:-10])
            with self.assertRaises(ValueError):m.read_osm(p)
    def test_filtered_tags_join(self):
        obj={'elements':[{'type':'way','id':3,'nodes':[1,2]},{'type':'node','id':1,'lon':10,'lat':50},{'type':'node','id':2,'lon':10.01,'lat':50},{'type':'route','id':3,'tags':{'highway':'primary','oneway':'','maxspeed':'50','maxspeed:forward':''}}]}
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'osm.json';p.write_text(json.dumps(obj));_,_,ways=m.read_osm(p)
            self.assertNotIn('oneway',ways[0]['tags']);self.assertEqual(m.speed(ways[0]['tags'],'forward'),42.5)
    def test_simplify_keeps_bend_and_endpoints(self):
        shape=[10,50,10.001,50,10.002,50,10.003,50.002,10.004,50.002]
        out=m.simplify(shape);self.assertEqual(out[:2],shape[:2]);self.assertEqual(out[-2:],shape[-2:]);self.assertIn(50.002,out);self.assertLess(len(out),len(shape))
    def test_speeds(self):
        self.assertEqual(m.speed({'highway':'motorway'},'forward'),130)
        self.assertEqual(m.speed({'highway':'primary','maxspeed':'50'},'forward'),42.5)
        self.assertEqual(m.speed({'highway':'primary','maxspeed':'100','maxspeed:backward':'30'},'backward'),25.5)
        self.assertEqual(m.speed({'highway':'motorway','maxspeed':'none'},'forward'),130)
        self.assertEqual(m.speed({'highway':'secondary','junction':'roundabout'},'forward'),25)
    def test_motorway_limits_override_reference_speed(self):
        for limit in [60,80,100,120,130,140]:
            self.assertEqual(m.speed({'highway':'motorway','maxspeed':str(limit)},'forward'),min(130,limit))
        tags={'highway':'motorway','maxspeed':'120','maxspeed:forward':'80','maxspeed:backward':'none'}
        self.assertEqual(m.speed(tags,'forward'),80)
        self.assertEqual(m.speed(tags,'backward'),130)
        self.assertAlmostEqual(m.speed({'highway':'motorway','maxspeed':'60 mph'},'forward'),96.56064)
    def test_directed_contraction(self):
        nodes=[[10,50],[10.01,50],[10.02,50]]
        edges=[[0,1,.7,1,-1,2,0,[10,50,10.01,50]],[2,1,.7,-1,2,2,0,[10.02,50,10.01,50]]]
        ns,es=m.contract(nodes,edges)
        self.assertEqual(len(ns),2);self.assertEqual(len(es),1)
        e=es[0];self.assertEqual(e[:7],[0,1,1.4,3,-1,2,0]);self.assertEqual(e[7],[10,50,10.01,50,10.02,50])
    def test_turn_via_survives_initial_way_split(self):
        ways=[{'nodes':[1,2,3]},{'nodes':[3,4]}]
        self.assertEqual(m.behalte_knoten(ways),{1,3,4})
        self.assertEqual(m.behalte_knoten(ways,[{'via':2},{'via':999}]),{1,2,3,4})

    def test_turn_via_survives_degree_two_contraction(self):
        nodes=[[0,0],[.005,0],[.01,0],[.015,0]]
        es=[[a,b,.3,1,1,2,0,[*nodes[a],*nodes[b]]] for a,b in [(0,1),(1,2),(2,3)]]
        fate={};mapping={}
        ns,out=m.contract(nodes,es,fate,geschuetzt={1},knotenmapping=mapping)
        via=mapping[1]
        self.assertEqual(ns[via],nodes[1])
        self.assertNotEqual(fate[0],fate[1])
        self.assertIn(via,out[fate[0]][:2]);self.assertIn(via,out[fate[1]][:2])
        self.assertEqual(len(out),2) # ungeschuetzter Nachbarknoten wird weiterhin verdichtet

    def test_motorway_limit_profiles(self):
        for raw,wert in [('none',0),('DE:motorway',0),('',-1),('signals',-1),('80',80),('160',160),('120;80',80)]:
            self.assertEqual(m.motorway_limit({'highway':'motorway','maxspeed':raw},'forward'),wert)
        tags={'highway':'motorway','maxspeed':'none','maxspeed:backward':'100'}
        self.assertEqual(m.motorway_limit(tags,'forward'),0)
        self.assertEqual(m.motorway_limit(tags,'backward'),100)
    def test_contraction_keeps_directional_speed_limits(self):
        nodes=[[10,50],[10.01,50],[10.02,50]]
        es=[[0,1,.7,1,2,0,0,[10,50,10.01,50],None,[[.7,80,100]]],[2,1,.7,3,4,0,0,[10.02,50,10.01,50],None,[[.7,120,0]]]]
        ns,es=m.contract(nodes,es)
        self.assertEqual(len(es),1)
        self.assertEqual(es[0][9],[[.7,80,100],[.7,0,120]])
        self.assertEqual(es[0][3:5],[5,5])
    def test_fan_in_is_not_a_through_route(self):
        nodes=[[0,0],[1,0],[2,0]]
        es=[[0,1,.5,1,-1,2,0,[0,0,1,0]],[2,1,.5,1,-1,2,0,[2,0,1,0]]]
        ns,es=m.contract(nodes,es);self.assertEqual(len(ns),3)
    def test_junction_is_preserved(self):
        nodes=[[0,0],[1,0],[2,0],[1,1]]
        es=[[a,b,.5,1,1,2,0,[*nodes[a],*nodes[b]]] for a,b in [(0,1),(1,2),(1,3)]]
        ns,es=m.contract(nodes,es);self.assertEqual(len(ns),4);self.assertEqual(len(es),3)
    def test_long_edges_preserve_snap_candidates(self):
        nodes=[[0,0],[1,0],[2,0]]
        es=[[a,b,1.5,1,1,2,0,[*nodes[a],*nodes[b]]] for a,b in [(0,1),(1,2)]]
        ns,es=m.contract(nodes,es);self.assertEqual(len(ns),3)
    def test_contraction_reports_edge_fate(self):
        # T-0030: Abbiegeverbote brauchen die neue Nummer jeder alten Kante
        nodes=[[0,0],[.005,0],[.01,0],[.02,0],[.01,.01]]
        es=[[a,b,.5,1,1,2,0,[*nodes[a],*nodes[b]]] for a,b in [(0,1),(1,2),(2,3),(2,4)]]
        verbleib={};ns,es=m.contract(nodes,es,verbleib)
        self.assertEqual(len(es),3);self.assertEqual(verbleib[0],verbleib[1])
        self.assertEqual(len({verbleib[0],verbleib[2],verbleib[3]}),3)
        self.assertEqual(sorted(es[verbleib[0]][:2]),sorted([ns.index([0,0]),ns.index([.01,0])]))
        self.assertEqual(sorted(es[verbleib[3]][:2]),sorted([ns.index([.01,0]),ns.index([.01,.01])]))
    def test_trapping_turn_restrictions_are_dropped(self):
        # T-0030: Stichstrasse 2 haengt nur an Via 1; Ring 0->1->3->0 (Einbahn); only 0->1->3 schneidet 2 ab
        import sys;sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'));import zusatz_netz as z
        es=[[0,1,1,1,1],[1,2,1,1,1],[1,3,1,1,-1],[3,0,1,1,-1]]
        self.assertEqual(z.abbiege_erreichbar(4,es,[],0),set())
        self.assertEqual(z.abbiege_erreichbar(4,es,[[1,0,2,1]],0),{2})
        rest,weg=z.entschaerfe_verbote(4,es,[[1,0,2,1],[1,2,0,0]],0)
        self.assertEqual(weg,2);self.assertEqual(rest,[])
        rest,weg=z.entschaerfe_verbote(4,es,[[1,2,1,0]],0)
        self.assertEqual((rest,weg),([[1,2,1,0]],0))
if __name__=='__main__':unittest.main()
