import { App, TFile, parseYaml, stringifyYaml, normalizePath } from 'obsidian';
import {
    CodexEntry,
    CodexCategoryDef,
    BUILTIN_CODEX_CATEGORIES,
    getBuiltinCodexCategory,
    makeCustomCodexCategory,
} from '../models/Codex';

/**
 * Manages generic Codex entries — loading, saving, creating, and deleting
 * .md files for any Codex category (Items, Creatures, Lore, Organizations,
 * Culture, Systems, and user-defined custom categories).
 *
 * Characters and Locations retain their specialised managers;
 * CodexManager handles everything else inside the project's Codex/ folder.
 */
export class CodexManager {
    private app: App;

    /**  category-id → Map<filePath, CodexEntry> */
    private entriesByCategory: Map<string, Map<string, CodexEntry>> = new Map();

    /** Resolved category definitions (built-in + custom) */
    private categoryDefs: Map<string, CodexCategoryDef> = new Map();

    constructor(app: App) {
        this.app = app;
    }

    // ── Category management ────────────────────────────

    /**
     * Initialise category definitions from enabled ids and any custom defs.
     * Called once on project load / settings change.
     *
     * @param enabledIds   e.g. ['items', 'creatures', 'my-custom']
     * @param customDefs   User-created category definitions (from settings)
     */
    initCategories(
        enabledIds: string[],
        customDefs: CodexCategoryDef[] = [],
    ): void {
        this.categoryDefs.clear();
        for (const id of enabledIds) {
            const builtin = getBuiltinCodexCategory(id);
            if (builtin) {
                this.categoryDefs.set(id, builtin);
            } else {
                const custom = customDefs.find(c => c.id === id);
                if (custom) this.categoryDefs.set(id, custom);
            }
        }
    }

    /** All resolved category definitions (respects current enabled list). */
    getCategories(): CodexCategoryDef[] {
        return Array.from(this.categoryDefs.values());
    }

    /** Lookup a single category definition. */
    getCategoryDef(id: string): CodexCategoryDef | undefined {
        return this.categoryDefs.get(id);
    }

    // ── Load ───────────────────────────────────────────

    /**
     * Load all entries for every enabled category from the Codex folder.
     * Expects structure:  `codexFolder/<CategoryFolder>/entry.md`
     */
    async loadAll(codexFolder: string): Promise<void> {
        this.entriesByCategory.clear();
        const adapter = this.app.vault.adapter;

        // Auto-create the Codex folder for existing projects that don't have one yet
        if (!await adapter.exists(codexFolder)) {
            await this.ensureFolder(codexFolder);
        }

        for (const [catId, catDef] of this.categoryDefs) {
            const catMap = new Map<string, CodexEntry>();
            const catFolder = normalizePath(`${codexFolder}/${catDef.folder}`);
            if (await adapter.exists(catFolder)) {
                await this.scanFolder(catFolder, catDef, catMap);
            }
            this.entriesByCategory.set(catId, catMap);
        }
    }

    /**
     * Load entries for a single category.
     */
    async loadCategory(codexFolder: string, categoryId: string): Promise<void> {
        const catDef = this.categoryDefs.get(categoryId);
        if (!catDef) return;

        const catMap = new Map<string, CodexEntry>();
        const catFolder = normalizePath(`${codexFolder}/${catDef.folder}`);
        const adapter = this.app.vault.adapter;
        if (await adapter.exists(catFolder)) {
            await this.scanFolder(catFolder, catDef, catMap);
        }
        this.entriesByCategory.set(categoryId, catMap);
    }

    private async scanFolder(
        folderPath: string,
        catDef: CodexCategoryDef,
        catMap: Map<string, CodexEntry>,
    ): Promise<void> {
        const adapter = this.app.vault.adapter;
        const listing = await adapter.list(folderPath);
        for (const f of listing.files) {
            if (f.endsWith('.md')) {
                try {
                    const fp = normalizePath(f);
                    const content = await adapter.read(fp);
                    const entry = this.parseEntry(content, fp, catDef);
                    if (entry) catMap.set(fp, entry);
                } catch { /* skip unreadable */ }
            }
        }
        // Recurse into subfolders (for nested entries)
        for (const sub of listing.folders) {
            await this.scanFolder(normalizePath(sub), catDef, catMap);
        }
    }

    // ── External file ingestion ────────────────────────

    /**
     * Try to add a single file from an external folder scan.
     * Tests against all enabled codex categories.
     * Returns true if the file matched any category.
     */
    addFile(content: string, filePath: string): boolean {
        for (const [catId, catDef] of this.categoryDefs) {
            const entry = this.parseEntry(content, filePath, catDef);
            if (entry) {
                let catMap = this.entriesByCategory.get(catId);
                if (!catMap) {
                    catMap = new Map();
                    this.entriesByCategory.set(catId, catMap);
                }
                if (!catMap.has(filePath)) {
                    catMap.set(filePath, entry);
                    return true;
                }
            }
        }
        return false;
    }

    // ── Query ──────────────────────────────────────────

    /** All entries for a category, sorted by name. */
    getEntries(categoryId: string): CodexEntry[] {
        const catMap = this.entriesByCategory.get(categoryId);
        if (!catMap) return [];
        return Array.from(catMap.values()).sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        );
    }

    /** Get a single entry by file path. */
    getEntry(filePath: string): CodexEntry | undefined {
        for (const catMap of this.entriesByCategory.values()) {
            const entry = catMap.get(filePath);
            if (entry) return entry;
        }
        return undefined;
    }

    /** Find entry by name within a category (case-insensitive). */
    findByName(categoryId: string, name: string): CodexEntry | undefined {
        const lower = name.toLowerCase();
        const entries = this.getEntries(categoryId);
        return entries.find(e => e.name.toLowerCase() === lower);
    }

    /** All entries across every category. */
    getAllEntries(): CodexEntry[] {
        const all: CodexEntry[] = [];
        for (const catMap of this.entriesByCategory.values()) {
            for (const entry of catMap.values()) all.push(entry);
        }
        return all.sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        );
    }

    /** Total entry count across all categories. */
    get totalCount(): number {
        let count = 0;
        for (const catMap of this.entriesByCategory.values()) count += catMap.size;
        return count;
    }

    // ── Create ─────────────────────────────────────────

    /**
     * Create a new entry .md file.
     */
    async createEntry(
        codexFolder: string,
        categoryId: string,
        name: string,
    ): Promise<CodexEntry> {
        const catDef = this.categoryDefs.get(categoryId);
        if (!catDef) throw new Error(`Unknown codex category: ${categoryId}`);

        const catFolder = normalizePath(`${codexFolder}/${catDef.folder}`);
        await this.ensureFolder(catFolder);

        const safeName = name.replace(/[\\/:*?"<>|]/g, '-');
        const filePath = normalizePath(`${catFolder}/${safeName}.md`);

        if (this.app.vault.getAbstractFileByPath(filePath)) {
            throw new Error(`Entry already exists: ${filePath}`);
        }

        const now = new Date().toISOString().split('T')[0];
        const fm: Record<string, any> = {
            type: catDef.id,
            name,
            created: now,
            modified: now,
        };

        await this.app.vault.create(filePath, `---\n${stringifyYaml(fm)}---\n`);

        const entry: CodexEntry = { filePath, type: catDef.id, name, created: now, modified: now };
        let catMap = this.entriesByCategory.get(categoryId);
        if (!catMap) {
            catMap = new Map();
            this.entriesByCategory.set(categoryId, catMap);
        }
        catMap.set(filePath, entry);
        return entry;
    }

    // ── Save ───────────────────────────────────────────

    /**
     * Save an entry back to its .md file.
     */
    async saveEntry(entry: CodexEntry): Promise<void> {
        const normalizedPath = normalizePath(entry.filePath);
        const file = this.app.vault.getAbstractFileByPath(normalizedPath);
        if (!(file instanceof TFile)) {
            throw new Error(`Codex entry file not found: ${normalizedPath}`);
        }

        const catDef = this.categoryDefs.get(entry.type);
        const fieldKeys = catDef?.fieldKeys ?? [];

        const content = await this.app.vault.read(file);
        const existingFm = this.extractFrontmatter(content) || {};
        const body = this.extractBody(content);

        const fm: Record<string, any> = { ...existingFm };
        fm.type = entry.type;
        fm.name = entry.name;
        fm.modified = new Date().toISOString().split('T')[0];
        if (entry.created) fm.created = entry.created;

        // Standard fields for this category
        for (const key of fieldKeys) {
            if (key === 'name') continue;
            const val = entry[key];
            if (val !== undefined && val !== null && val !== '' &&
                !(Array.isArray(val) && val.length === 0)) {
                fm[key] = val;
            } else {
                delete fm[key];
            }
        }

        // Series-ready: books list
        if (entry.books && entry.books.length > 0) {
            fm.books = entry.books;
        } else {
            delete fm.books;
        }

        // Custom fields
        if (entry.custom && Object.keys(entry.custom).length > 0) {
            fm.custom = entry.custom;
        } else {
            delete fm.custom;
        }

        // Universal field template values
        if (entry.universalFields && Object.keys(entry.universalFields).length > 0) {
            fm.universalFields = entry.universalFields;
        } else {
            delete fm.universalFields;
        }

        const finalBody = entry.notes ?? body;
        const newContent = `---\n${stringifyYaml(fm)}---\n${finalBody ? '\n' + finalBody : ''}`;
        await this.app.vault.modify(file, newContent);

        // Update in-memory cache
        for (const catMap of this.entriesByCategory.values()) {
            if (catMap.has(normalizedPath)) {
                catMap.set(normalizedPath, { ...entry, filePath: normalizedPath });
                break;
            }
        }
    }

    // ── Delete ─────────────────────────────────────────

    async deleteEntry(filePath: string): Promise<void> {
        const normalizedPath = normalizePath(filePath);
        const file = this.app.vault.getAbstractFileByPath(normalizedPath);
        if (file instanceof TFile) {
            await this.app.vault.trash(file, true);
        }
        for (const catMap of this.entriesByCategory.values()) {
            catMap.delete(normalizedPath);
        }
    }

    // ── Rename ─────────────────────────────────────────

    async renameEntry(
        entry: CodexEntry,
        newName: string,
        codexFolder: string,
    ): Promise<CodexEntry> {
        const catDef = this.categoryDefs.get(entry.type);
        if (!catDef) throw new Error(`Unknown category: ${entry.type}`);

        const catFolder = normalizePath(`${codexFolder}/${catDef.folder}`);
        const safeName = newName.replace(/[\\/:*?"<>|]/g, '-');
        const newPath = normalizePath(`${catFolder}/${safeName}.md`);
        const oldPath = normalizePath(entry.filePath);

        const file = this.app.vault.getAbstractFileByPath(oldPath);
        if (file instanceof TFile && newPath !== oldPath) {
            await this.app.fileManager.renameFile(file, newPath);
        }

        // Update cache
        for (const catMap of this.entriesByCategory.values()) {
            if (catMap.has(oldPath)) {
                catMap.delete(oldPath);
                break;
            }
        }

        const updated: CodexEntry = { ...entry, filePath: newPath, name: newName };
        let catMap = this.entriesByCategory.get(entry.type);
        if (!catMap) {
            catMap = new Map();
            this.entriesByCategory.set(entry.type, catMap);
        }
        catMap.set(newPath, updated);
        await this.saveEntry(updated);
        return updated;
    }

    // ── Parsing helpers ────────────────────────────────

    private parseEntry(
        content: string,
        filePath: string,
        catDef: CodexCategoryDef,
    ): CodexEntry | null {
        const fm = this.extractFrontmatter(content);
        if (!fm) return null;

        // Accept entries whose type matches the category id
        if (fm.type !== catDef.id) return null;

        const body = this.extractBody(content);
        const basename = filePath.split('/').pop()?.replace(/\.md$/i, '') ?? filePath;

        const entry: CodexEntry = {
            filePath,
            type: catDef.id,
            name: fm.name || basename,
            image: fm.image,
            gallery: this.parseGallery(fm.gallery),
            created: fm.created,
            modified: fm.modified,
            notes: body || undefined,
            custom: fm.custom && typeof fm.custom === 'object' ? fm.custom : undefined,
            universalFields: fm.universalFields && typeof fm.universalFields === 'object' ? fm.universalFields : undefined,
            books: Array.isArray(fm.books) ? fm.books.map(String) : undefined,
        };

        // Load all standard field values
        for (const key of catDef.fieldKeys) {
            if (key === 'name' || key === 'image' || key === 'gallery') continue;
            if (fm[key] !== undefined && fm[key] !== null) {
                entry[key] = fm[key];
            }
        }

        return entry;
    }

    private extractFrontmatter(content: string): Record<string, any> | null {
        // Strip BOM + invisible zero-width characters before matching
        const clean = content.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');
        const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!match) return null;
        try {
            return parseYaml(match[1]);
        } catch {
            return null;
        }
    }

    private extractBody(content: string): string {
        const clean = content.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');
        const match = clean.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
        return match ? match[1].trim() : '';
    }

    private parseGallery(
        value: any,
    ): Array<{ path: string; caption: string }> | undefined {
        if (!Array.isArray(value)) return undefined;
        const parsed: Array<{ path: string; caption: string }> = [];
        for (const item of value) {
            if (!item || typeof item !== 'object') continue;
            const p = typeof item.path === 'string' ? item.path : '';
            const c = typeof item.caption === 'string' ? item.caption : '';
            if (!p) continue;
            parsed.push({ path: p, caption: c });
        }
        return parsed.length ? parsed : undefined;
    }

    private async ensureFolder(folderPath: string): Promise<void> {
        const normalized = normalizePath(folderPath);
        if (this.app.vault.getAbstractFileByPath(normalized)) return;
        await this.app.vault.createFolder(normalized);
    }
}
