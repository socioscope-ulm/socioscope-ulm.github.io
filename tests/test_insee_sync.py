import importlib.util
import pathlib
import unittest

root = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("sync_insee", root / "scripts" / "sync_insee.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InseeAnnualTests(unittest.TestCase):
    def test_parse_sdmx_generic_observations(self):
        xml = b'''<GenericData xmlns:g="urn:test"><g:Obs><g:ObsDimension value="2024"/><g:ObsValue value="2.0"/></g:Obs><g:Obs><g:ObsDimension value="2025"/><g:ObsValue value="0.9"/></g:Obs></GenericData>'''
        self.assertEqual(module.extract_observations(xml), {2024: 2.0, 2025: 0.9})

    def test_append_only_when_next_year_official_and_complete(self):
        original = {"idbank": "011814640", "values": [{"year": 2025, "value": 0.9}]}
        result, added = module.merge_snapshot(original, {2024: 2.0, 2025: 1.0, 2026: 1.7}, 2027)
        self.assertEqual(added, [2026])
        self.assertEqual(result["values"], [{"year": 2025, "value": 0.9}, {"year": 2026, "value": 1.7}])
        self.assertEqual(original["values"], [{"year": 2025, "value": 0.9}])

    def test_no_incomplete_current_year_and_no_overwrite(self):
        original = {"idbank": "011814640", "values": [{"year": 2025, "value": 0.9}]}
        result, added = module.merge_snapshot(original, {2025: 1.0, 2026: 5.0}, 2026)
        self.assertEqual((result, added), (original, []))

    def test_reject_wrong_series(self):
        with self.assertRaises(ValueError):
            module.merge_snapshot({"idbank": "unknown", "values": []}, {2025: 0.9}, 2026)

    def test_reject_unrelated_xml(self):
        with self.assertRaises(ValueError):
            module.extract_observations(b'<GenericData><Obs TIME_PERIOD="2025" OBS_VALUE="2.6"/></GenericData>')


if __name__ == "__main__":
    unittest.main()
