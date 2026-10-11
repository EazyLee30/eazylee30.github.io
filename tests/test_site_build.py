"""Journal publishing behavior, without adding invented content to the real site."""
import importlib.util, json, tempfile, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('site_build',Path(__file__).resolve().parents[1]/'scripts/build_site.py')
build=importlib.util.module_from_spec(spec);spec.loader.exec_module(build)
class JournalBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.oldroot=build.ROOT; build.ROOT=Path(self.temp.name)
        for locale in build.LOCALES:(build.ROOT/f'content/journal/{locale}').mkdir(parents=True)
    def tearDown(self):build.ROOT=self.oldroot;self.temp.cleanup()
    def entry(self,locale='en',draft='false'):
        path=build.ROOT/f'content/journal/{locale}/2026-10-11-test.md'
        path.write_text(f'---\ntitle: Test & notes\ndraft: {draft}\n---\n\n## A heading\n\n**Bold** text.\n\n```python\nprint("test")\n```\n');return path
    def test_translation_fallback_and_markdown(self):
        self.entry();entries=build.journal_entries()
        for locale in build.LOCALES:build.build_journal(locale,entries)
        page=(build.ROOT/'tw/journal/2026-10-11-test/index.html').read_text()
        self.assertIn('<strong>Bold</strong>',page);self.assertIn('lang="en"',page);self.assertIn('這篇日記的原文語言是',page);self.assertIn('Test &amp; notes',page)
        self.entry('zh-TW');build.build_journal('zh-TW',build.journal_entries())
        self.assertNotIn('translation-note',(build.ROOT/'tw/journal/2026-10-11-test/index.html').read_text())
    def test_drafts_and_deleted_entries_remove_generated_pages(self):
        path=self.entry();build.build_journal('en',build.journal_entries());article=build.ROOT/'journal/2026-10-11-test/index.html';self.assertTrue(article.exists())
        self.entry(draft='true');build.build_journal('en',build.journal_entries());self.assertFalse(article.exists())
        self.entry();build.build_journal('en',build.journal_entries());path.unlink();build.build_journal('en',build.journal_entries());self.assertFalse(article.exists())
    def test_invalid_date_is_rejected(self):
        (build.ROOT/'content/journal/en/2026-02-30-test.md').write_text('test')
        with self.assertRaises(ValueError):build.journal_entries()
if __name__=='__main__':unittest.main()
