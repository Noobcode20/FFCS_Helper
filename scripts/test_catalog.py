"""Source-transform regression checks (standard library only)."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('refresh', ROOT / 'scripts/refresh-catalog.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class CatalogIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / 'src/data/catalog.json').read_text())
        cls.audit = json.loads((ROOT / 'src/data/catalog-audit.json').read_text())
        cls.slots = json.loads((ROOT / 'src/data/slot-map.json').read_text())['slots']

    def test_reject_executable_source(self):
        with self.assertRaises(ValueError):
            refresh.literal('{faculty: execute()}')

    def test_lab_pairs_not_dropped_or_invented(self):
        with self.assertRaises(AssertionError):
            refresh.resolve(['L1'], self.slots)
        with self.assertRaises(AssertionError):
            refresh.resolve(['L1', 'L4'], self.slots)
        meetings = refresh.resolve(['L1', 'L2', 'L31', 'L32'], self.slots)
        self.assertEqual([(m['start'], m['end']) for m in meetings], [(480, 580), (840, 940)])

    def test_different_slot_names_really_overlap(self):
        a = self.slots['A1'][0]
        lab = self.slots['L1+L2'][0]
        self.assertEqual(a['day'], lab['day'])
        self.assertTrue(a['start'] < lab['end'] and lab['start'] < a['end'])
        # Tutorial TB1 overlaps two lab blocks in the source grid.
        b = self.slots['TB1'][0]
        for code in ['L3+L4', 'L5+L6']:
            lab = self.slots[code][0]
            self.assertTrue(b['start'] < lab['end'] and lab['start'] < b['end'])

    def test_ambiguous_embedded_courses_excluded(self):
        excluded = {o['code'] for o in self.audit['omissions']}
        codes = {c['code'] for c in self.catalog['courses']}
        self.assertTrue({'BCSE101E', 'BCSE103E', 'BCSE203E', 'BCSE432E', 'BHUM102E'} <= excluded)
        self.assertFalse(excluded & codes)
        self.assertIn('BCSE202L', codes)
        self.assertIn('BCSE202P', codes)
        for offering in self.catalog['offerings']:
            kinds = {c['type'] for c in offering['components']}
            self.assertFalse('lab' in kinds and ('theory' in kinds or 'tutorial' in kinds))

    def test_truthful_missing_data_and_provenance(self):
        self.assertEqual(self.catalog['reviews'], [])
        self.assertIn('Unknown semester', self.catalog['semester'])
        self.assertEqual(self.catalog['provenance']['status'], 'historical')
        for course in self.catalog['courses']:
            self.assertIsNone(course['credits'])
        for offering in self.catalog['offerings']:
            self.assertTrue(offering['section'].startswith('Planning ID'))
            self.assertIn(offering['id'], self.audit['recordSources'])
            self.assertEqual(offering['provenance']['license'], 'MIT')
            self.assertTrue(all(c['slots'] and c['meetings'] for c in offering['components']))
            for component in offering['components']:
                self.assertEqual(set(component['slots']), {m['slot'] for m in component['meetings']})

    def test_row_accounting(self):
        n = self.audit['counts']
        self.assertEqual(n['sourceRows'], n['offerings'] + n['duplicateRows'] + n['omittedRows'])
        self.assertEqual(n['scopeCourseCodes'], n['courses'] + n['omittedCourses'])


if __name__ == '__main__':
    unittest.main()
