"""Check publication boundaries and generated links for the Mosaico collection."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('mosaico_build', Path(__file__).resolve().parents[1] / 'scripts/build_mosaico.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class MosaicoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'content/mosaico').mkdir(parents=True)

    def tearDown(self):
        self.temp.cleanup()

    def article(self, draft='false', name='2026-10-23-test.md'):
        p = self.root / 'content/mosaico' / name
        p.write_text(f'---\ntitle: Claw & Ideas\ndescription: A real device test\ndraft: {draft}\n---\n\n## Result\n\n**Verified**.\n\n[Download](/mosaico/downloads/skill.zip)\n')
        return p

    def test_article_index_metadata_and_markdown(self):
        self.article()
        self.assertEqual(build.build(self.root), 1)
        index = (self.root / 'mosaico/index.html').read_text()
        article = (self.root / 'mosaico/2026-10-23-test/index.html').read_text()
        self.assertIn('href="/mosaico/2026-10-23-test/"', index)
        self.assertIn('Claw &amp; Ideas', article)
        self.assertIn('<strong>Verified</strong>', article)
        self.assertIn('https://eazylee.xyz/mosaico/2026-10-23-test/', article)
        self.assertIn('href="#result"', article)

    def test_drafts_and_removed_articles_preserve_other_assets(self):
        p = self.article()
        build.build(self.root)
        article = self.root / 'mosaico/2026-10-23-test/index.html'
        other = self.root / 'mosaico/assets/example.txt'
        other.parent.mkdir(); other.write_text('keep')
        self.article(draft='true')
        self.assertEqual(build.build(self.root), 0)
        self.assertFalse(article.exists())
        self.assertEqual(other.read_text(), 'keep')
        self.article(); build.build(self.root); p.unlink(); build.build(self.root)
        self.assertFalse(article.exists())

    def test_templates_and_unrelated_content_are_not_published(self):
        self.article(name='_template.md')
        (self.root / 'content/other.md').write_text('Not Mosaico')
        self.assertEqual(build.build(self.root), 0)

    def test_invalid_calendar_date_rejected(self):
        self.article(name='2026-02-30-test.md')
        with self.assertRaises(ValueError):
            build.build(self.root)


if __name__ == '__main__':
    unittest.main()
