import { ItemView, WorkspaceLeaf, WorkspaceSplit, MarkdownRenderer, TFile } from 'obsidian';
import { EditorView, Decoration } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, Compartment } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Scene, SceneFilter, SortConfig } from '../models/Scene';
import { SceneManager } from '../services/SceneManager';
import { renderViewSwitcher } from '../components/ViewSwitcher';
import { FiltersComponent } from '../components/Filters';
import type SceneCardsPlugin from '../main';
import { MANUSCRIPT_VIEW_TYPE } from '../constants';
import { applyMobileClass, isMobile, isPhone, isTablet } from '../components/MobileAdapter';

/**
 * Manuscript View — Scrivenings-style continuous document view.
 *
 * Embeds real Obsidian MarkdownView editors (Live Preview) for each scene
 * inside a single scrollable document with act/chapter dividers. Frontmatter
 * is hidden via CSS. Editors are lazy-loaded as scenes scroll into view.
 */
export class ManuscriptView extends ItemView {
    private plugin: SceneCardsPlugin;
    private sceneManager: SceneManager;
    private rootContainer: HTMLElement | null = null;
    private scrollArea: HTMLElement | null = null;
    private footerEl: HTMLElement | null = null;
    private filtersComponent: FiltersComponent | null = null;
    private currentFilter: SceneFilter = {};
    private currentSort: SortConfig = { field: 'sequence', direction: 'asc' };
    private focusObserver: IntersectionObserver | null = null;
    private lazyObserver: IntersectionObserver | null = null;
    private embeddedLeaves: Map<string, WorkspaceLeaf> = new Map();
    private editorResizeObservers: Map<string, ResizeObserver> = new Map();
    /** Paths currently being mounted (prevents duplicate async mounts) */
    private mountingPaths: Set<string> = new Set();
    private _hasActiveFocus = false;
    /** Prevents refresh() from running during initial mount sequence */
    private _isMounting = false;
    /** When true, hide wiki-link/tag styling so text reads as plain prose */
    private _plainText = true;
    /** When true, links/tags are atomic (cursor skips over them) */
    private _lockLinks = true;
    /** CM6 compartment for toggling atomic-link extension */
    private atomicCompartment = new Compartment();
    /** File path of the scene currently most visible in the scroll area */
    focusedScenePath: string | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: SceneCardsPlugin, sceneManager: SceneManager) {
        super(leaf);
        this.plugin = plugin;
        this.sceneManager = sceneManager;
    }

    getViewType(): string {
        return MANUSCRIPT_VIEW_TYPE;
    }

    getDisplayText(): string {
        const title = this.plugin?.sceneManager?.activeProject?.title;
        return title ? `Manuscript - ${title}` : 'Manuscript';
    }

    getIcon(): string {
        return 'book-open-text';
    }

    async onOpen(): Promise<void> {
        this.plugin.storyLeaf = this.leaf;
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('story-line-manuscript-container');
        applyMobileClass(container);
        this.rootContainer = container;

        await this.sceneManager.initialize();
        this.renderView(container);
    }

    async onClose(): Promise<void> {
        this.detachAllEmbedded();
        this.focusObserver?.disconnect();
        this.lazyObserver?.disconnect();
        this.focusObserver = null;
        this.lazyObserver = null;
    }


    /** Called by refreshOpenViews() */
    refresh(): void {
        // Don't re-render while user is editing or during mount sequence
        if (this._hasActiveFocus || this._isMounting) {
            this.updateFooter();
            return;
        }
        if (this.rootContainer) {
            this.renderView(this.rootContainer);
        }
    }

    private detachAllEmbedded(): void {
        for (const [, leaf] of this.embeddedLeaves) {
            leaf.detach();
        }
        this.embeddedLeaves.clear();
        for (const [, ro] of this.editorResizeObservers) {
            ro.disconnect();
        }
        this.editorResizeObservers.clear();
        this.mountingPaths.clear();
    }

    private renderView(container: HTMLElement): void {
        this.detachAllEmbedded();
        container.empty();

        // Toolbar
        const toolbar = container.createDiv('story-line-toolbar');
        const titleRow = toolbar.createDiv('story-line-title-row');
        titleRow.createEl('h3', { cls: 'story-line-view-title', text: 'StoryLine' });

        // View switcher tabs
        renderViewSwitcher(toolbar, MANUSCRIPT_VIEW_TYPE, this.plugin, this.leaf);

        // Filters
        const filterContainer = container.createDiv('story-line-filters-container');
        this.filtersComponent = new FiltersComponent(
            filterContainer,
            this.sceneManager,
            (filter, sort) => {
                this.currentFilter = filter;
                this.currentSort = sort;
                this.renderManuscript();
            },
            this.plugin
        );
        this.filtersComponent.render();

        // Plain-text toggle (same style as Board view's Scenes on/off)
        const filterBar = filterContainer.querySelector('.story-line-filter-bar');
        if (filterBar) {
            const plainWrap = (filterBar as HTMLElement).createEl('label', { cls: 'sl-toggle-wrap' });
            plainWrap.createSpan({ cls: 'sl-toggle-label', text: 'Plain text' });
            const plainCb = plainWrap.createEl('input', { type: 'checkbox' });
            plainCb.checked = this._plainText;
            plainWrap.createSpan({ cls: 'sl-toggle-track' });
            plainCb.addEventListener('change', () => {
                this._plainText = plainCb.checked;
                this.scrollArea?.toggleClass('sl-manuscript-plain', this._plainText);
            });

            const lockWrap = (filterBar as HTMLElement).createEl('label', { cls: 'sl-toggle-wrap' });
            lockWrap.createSpan({ cls: 'sl-toggle-label', text: 'Lock links' });
            const lockCb = lockWrap.createEl('input', { type: 'checkbox' });
            lockCb.checked = this._lockLinks;
            lockWrap.createSpan({ cls: 'sl-toggle-track' });
            lockCb.addEventListener('change', () => {
                this._lockLinks = lockCb.checked;
                this.updateAtomicLinks();
            });
        }

        // Manuscript scroll area
        this.scrollArea = container.createDiv('sl-manuscript-scroll');
        if (this._plainText) this.scrollArea.addClass('sl-manuscript-plain');

        // Track focus in embedded editors so refresh() doesn't destroy them mid-edit
        this.scrollArea.addEventListener('focusin', () => { this._hasActiveFocus = true; });
        this.scrollArea.addEventListener('focusout', () => {
            setTimeout(() => {
                if (!this.scrollArea?.contains(document.activeElement)) {
                    this._hasActiveFocus = false;
                }
            }, 100);
        });

        // Footer word count
        this.footerEl = container.createDiv('sl-manuscript-footer');

        // Set up IntersectionObserver to track which scene is in view
        this.setupFocusObserver();

        this.renderManuscript();
    }

    private async renderManuscript(): Promise<void> {
        if (!this.scrollArea || !this.footerEl) return;
        this.detachAllEmbedded();
        this.scrollArea.empty();
        this.footerEl.empty();

        const scenes = this.sceneManager.getFilteredScenes(this.currentFilter, this.currentSort)
            .filter(s => !s.corkboardNote);

        // For manuscript view, always sort by act → chapter → sequence
        // so scenes are grouped properly under their act/chapter dividers.
        // Only compare act/chapter when both scenes have the field defined;
        // if one or both are missing, fall through to sequence.
        scenes.sort((a, b) => {
            if (a.act != null && b.act != null) {
                const actCmp = Number(a.act) - Number(b.act);
                if (actCmp !== 0) return actCmp;
            }
            if (a.chapter != null && b.chapter != null) {
                const chCmp = Number(a.chapter) - Number(b.chapter);
                if (chCmp !== 0) return chCmp;
            }
            return (a.sequence ?? 9999) - (b.sequence ?? 9999);
        });

        if (scenes.length === 0) {
            this.scrollArea.createDiv({
                cls: 'sl-manuscript-empty',
                text: 'No scenes match the current filters.',
            });
            this.footerEl.setText('0 words');
            return;
        }

        // Lazy loading observer — mount editors as they scroll into view
        this.lazyObserver?.disconnect();
        this.lazyObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        const el = entry.target as HTMLElement;
                        const path = el.dataset.scenePath;
                        if (path && !this.embeddedLeaves.has(path) && !this.mountingPaths.has(path)) {
                            this.mountEditor(el, path);
                        }
                    }
                }
            },
            { root: this.scrollArea, rootMargin: '400px 0px' }
        );

        let totalWords = 0;
        let lastAct: string | number | undefined;
        let lastChapter: string | number | undefined;

        const editorContainers: { el: HTMLElement; path: string }[] = [];

        for (const scene of scenes) {
            // Act divider
            if (scene.act !== undefined && scene.act !== lastAct) {
                lastAct = scene.act;
                lastChapter = undefined;
                const actDiv = this.scrollArea.createDiv('sl-manuscript-act-divider');
                actDiv.createEl('span', {
                    cls: 'sl-manuscript-act-label',
                    text: `Act ${scene.act}`,
                });
            }

            // Chapter divider
            if (scene.chapter !== undefined && scene.chapter !== lastChapter) {
                lastChapter = scene.chapter;
                const chapDiv = this.scrollArea.createDiv('sl-manuscript-chapter-divider');
                chapDiv.createEl('span', {
                    cls: 'sl-manuscript-chapter-label',
                    text: `Chapter ${scene.chapter}`,
                });
            }

            // Scene block
            const block = this.scrollArea.createDiv('sl-manuscript-scene-block');
            block.dataset.scenePath = scene.filePath;
            if (this.focusObserver) this.focusObserver.observe(block);

            // Scene header: title + status badge
            const header = block.createDiv('sl-manuscript-scene-header');
            const titleEl = header.createEl('span', {
                cls: 'sl-manuscript-scene-title',
                text: scene.title,
            });
            titleEl.addEventListener('click', () => {
                const file = this.app.vault.getAbstractFileByPath(scene.filePath);
                if (file instanceof TFile) {
                    this.app.workspace.getLeaf('tab').openFile(file);
                }
            });
            if (scene.status) {
                header.createEl('span', {
                    cls: `sl-manuscript-status sl-status-${scene.status}`,
                    text: scene.status,
                });
            }

            // Editor container — track for eager mounting, observe for lazy loading
            const editorWrap = block.createDiv('sl-manuscript-editor-wrap');
            editorWrap.dataset.scenePath = scene.filePath;
            editorWrap.createDiv({ cls: 'sl-manuscript-loading', text: 'Loading…' });
            this.lazyObserver.observe(editorWrap);
            editorContainers.push({ el: editorWrap, path: scene.filePath });

            totalWords += scene.wordcount ?? 0;
        }

        // Footer
        const wordLabel = totalWords === 1 ? 'word' : 'words';
        this.footerEl.setText(`${scenes.length} scenes · ${totalWords.toLocaleString()} ${wordLabel}`);

        // Eagerly mount the first few editors immediately (don't wait for IntersectionObserver)
        this._isMounting = true;
        const eagerCount = Math.min(3, editorContainers.length);
        for (let i = 0; i < eagerCount; i++) {
            await this.mountEditor(editorContainers[i].el, editorContainers[i].path);
        }
        this._isMounting = false;
    }

    /** Mount a real Obsidian MarkdownView (Live Preview) inside the given container */
    private async mountEditor(container: HTMLElement, filePath: string): Promise<void> {
        if (this.embeddedLeaves.has(filePath) || this.mountingPaths.has(filePath)) return;
        this.mountingPaths.add(filePath);

        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            this.mountingPaths.delete(filePath);
            return;
        }

        container.empty(); // Remove "Loading…" placeholder

        // On mobile (phone + tablet), embedded WorkspaceSplit editors
        // don't render reliably. Fall back to static rendered markdown.
        if (isPhone || isTablet) {
            this.mountingPaths.delete(filePath);
            await this.mountReadOnlyPreview(container, filePath);
            return;
        }

        try {
            // Create a detached WorkspaceSplit to host the embedded leaf
            const split = new (WorkspaceSplit as any)(this.app.workspace, 'vertical');
            const splitEl: HTMLElement = (split as any).containerEl;
            container.appendChild(splitEl);
            splitEl.classList.add('sl-manuscript-embedded-split');

            // Give the split an initial height so the absolute-positioned
            // workspace-leaf chain has a viewport for CM6 to render into.
            splitEl.style.height = '300px';

            const leaf = this.app.workspace.createLeafInParent(split, 0);

            await leaf.openFile(file, {
                state: { mode: 'source', source: false },
            });

            this.embeddedLeaves.set(filePath, leaf);
            this.mountingPaths.delete(filePath);

            // Inject the atomic-links extension into the CM6 editor
            this.injectAtomicExtension(leaf);

            // Obsidian's workspace-leaf uses position:absolute + inset:0,
            // which collapses to 0 in a detached split because splitEl has
            // no explicit height. Fix: measure the actual content height
            // and set splitEl to that pixel height.
            let rafPending = false;
            const syncHeight = () => {
                // Measure the inner content height.
                // cm-sizer holds the actual content; cm-scroller's scrollHeight
                // captures full content even when clipped by overflow:hidden.
                const sizer = splitEl.querySelector('.cm-sizer') as HTMLElement | null;
                const scroller = splitEl.querySelector('.cm-scroller') as HTMLElement | null;
                const cmEl = splitEl.querySelector('.cm-editor') as HTMLElement | null;
                const el = sizer || cmEl;
                if (!el) return;
                const rect = el.getBoundingClientRect().height;
                const offset = el.offsetHeight;
                const scroll = scroller ? scroller.scrollHeight : 0;
                const h = Math.max(rect, offset, scroll);
                if (h > 0) {
                    const px = Math.ceil(h) + 'px';
                    splitEl.style.height = px;
                    container.style.height = px;
                }
            };

            // Debounced version for ResizeObserver
            const debouncedSync = () => {
                if (rafPending) return;
                rafPending = true;
                requestAnimationFrame(() => {
                    rafPending = false;
                    syncHeight();
                });
            };

            // CM6 may render lazily; sync across multiple frames.
            requestAnimationFrame(() => {
                syncHeight();
                requestAnimationFrame(() => {
                    syncHeight();
                    setTimeout(syncHeight, 300);
                });
            });

            // On tablet, poll until height stabilises (CM6 can take
            // a long time to lay out content on mobile browsers).
            if (isMobile) {
                let lastH = 0;
                let stableCount = 0;
                const poll = setInterval(() => {
                    syncHeight();
                    const sizer = splitEl.querySelector('.cm-sizer') as HTMLElement | null;
                    const h = sizer ? Math.max(sizer.getBoundingClientRect().height, sizer.offsetHeight) : 0;
                    if (h > 0 && Math.abs(h - lastH) < 2) {
                        stableCount++;
                        if (stableCount >= 3) clearInterval(poll);
                    } else {
                        stableCount = 0;
                        lastH = h;
                    }
                }, 250);
                setTimeout(() => clearInterval(poll), 10000);
            }

            // Keep height synced as user edits (content grows/shrinks).
            // Observe both .cm-editor and .cm-content — on mobile the
            // inner content node may resize independently.
            const cmEl = splitEl.querySelector('.cm-editor') as HTMLElement | null;
            const cmContent = splitEl.querySelector('.cm-content') as HTMLElement | null;
            if (cmEl) {
                const ro = new ResizeObserver(() => debouncedSync());
                ro.observe(cmEl);
                if (cmContent && cmContent !== cmEl) ro.observe(cmContent);
                this.editorResizeObservers.set(filePath, ro);
            }
        } catch (err) {
            this.mountingPaths.delete(filePath);
            console.warn('StoryLine: embedded editor failed, falling back to preview', err);
            await this.mountReadOnlyPreview(container, filePath);
        }
    }

    /** Render scene body as static markdown (read-only fallback for mobile) */
    private async mountReadOnlyPreview(
        container: HTMLElement,
        filePath: string,
    ): Promise<void> {
        const scene = this.sceneManager.getScene(filePath);
        const text = (scene?.body ?? '').trim();
        if (text) {
            const previewEl = container.createDiv('sl-manuscript-preview');
            await MarkdownRenderer.render(this.app, text, previewEl, filePath, this);
        } else {
            container.createDiv({ cls: 'sl-manuscript-scene-empty', text: 'Empty scene' });
        }
    }

    /** Get the CM6 EditorView from an embedded workspace leaf */
    private getCmView(leaf: WorkspaceLeaf): EditorView | null {
        const editor = (leaf.view as any)?.editor;
        return editor?.cm ?? null;
    }

    /**
     * Build a CM6 extension that makes wiki-link and tag ranges atomic.
     * When enabled, the cursor skips over link/tag text.
     */
    private buildAtomicExtension(): ReturnType<typeof EditorView.atomicRanges.of> {
        return EditorView.atomicRanges.of((view) => {
            const builder = new RangeSetBuilder<Decoration>();
            const tree = syntaxTree(view.state);
            // Walk the syntax tree and mark internal-link and tag nodes
            tree.iterate({
                enter(node: { name: string; from: number; to: number }) {
                    // Obsidian uses these node names for wiki-links and tags
                    // in its markdown parser. Internal links are typically
                    // "hmd-internal-link" ranges; tags are "hashtag" ranges.
                    const name = node.name;
                    if (
                        name.includes('hmd-internal-link') ||
                        name.includes('internal-link') ||
                        name === 'hashtag' ||
                        name.includes('HyperMD-internal-link') ||
                        name.includes('formatting-link')
                    ) {
                        // Avoid duplicate overlapping ranges — only mark leaf nodes
                        if (node.from < node.to) {
                            builder.add(node.from, node.to, Decoration.mark({}));
                        }
                    }
                },
            });
            return builder.finish();
        });
    }

    /** Inject the atomic-links compartment into a single embedded editor */
    private injectAtomicExtension(leaf: WorkspaceLeaf): void {
        const cm = this.getCmView(leaf);
        if (!cm) return;
        const ext = this._lockLinks ? this.buildAtomicExtension() : [];
        cm.dispatch({
            effects: StateEffect.appendConfig.of(
                this.atomicCompartment.of(ext)
            ),
        });
    }

    /** Toggle atomic links on/off in all currently mounted editors */
    private updateAtomicLinks(): void {
        const ext = this._lockLinks ? this.buildAtomicExtension() : [];
        for (const [, leaf] of this.embeddedLeaves) {
            const cm = this.getCmView(leaf);
            if (!cm) continue;
            cm.dispatch({
                effects: this.atomicCompartment.reconfigure(ext),
            });
        }
    }

    /** Recalculate the footer word count from SceneManager data */
    private updateFooter(): void {
        if (!this.footerEl) return;
        const scenes = this.sceneManager.getFilteredScenes(this.currentFilter, this.currentSort)
            .filter(s => !s.corkboardNote);
        let totalWords = 0;
        for (const s of scenes) {
            totalWords += s.wordcount ?? 0;
        }
        const wordLabel = totalWords === 1 ? 'word' : 'words';
        this.footerEl.setText(`${scenes.length} scenes · ${totalWords.toLocaleString()} ${wordLabel}`);
    }

    /** IntersectionObserver to detect which scene block is most visible (for Inspector sync) */
    private setupFocusObserver(): void {
        this.focusObserver?.disconnect();
        if (!this.scrollArea) return;

        const visibleEntries = new Map<string, number>();

        this.focusObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const path = (entry.target as HTMLElement).dataset.scenePath;
                    if (!path) continue;
                    visibleEntries.set(path, entry.intersectionRatio);
                    if (!entry.isIntersecting) visibleEntries.delete(path);
                }

                // Pick the scene with the highest intersection ratio
                let best: string | null = null;
                let bestRatio = 0;
                for (const [path, ratio] of visibleEntries) {
                    if (ratio > bestRatio) {
                        best = path;
                        bestRatio = ratio;
                    }
                }

                if (best && best !== this.focusedScenePath) {
                    this.focusedScenePath = best;
                    // Notify Inspector sidebar
                    this.app.workspace.trigger('storyline:manuscript-focus', best);
                }
            },
            {
                root: this.scrollArea,
                threshold: [0, 0.25, 0.5, 0.75, 1],
            }
        );
    }

    /**
     * Scroll the manuscript to bring the given scene into view.
     * Called by the Navigator when a scene is clicked while Manuscript is active.
     */
    scrollToScene(filePath: string): void {
        if (!this.scrollArea) return;
        const block = this.scrollArea.querySelector(
            `[data-scene-path="${CSS.escape(filePath)}"]`
        ) as HTMLElement | null;
        if (block) {
            block.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}
