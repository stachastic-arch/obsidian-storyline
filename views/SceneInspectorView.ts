import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import type SceneCardsPlugin from '../main';
import { SceneManager } from '../services/SceneManager';
import { InspectorComponent } from '../components/Inspector';
import { SCENE_INSPECTOR_VIEW_TYPE } from '../constants';

/**
 * Standalone Scene Inspector sidebar view.
 *
 * Automatically shows scene details for the active editor file,
 * allowing users to view and edit metadata while writing in the editor.
 */
export class SceneInspectorView extends ItemView {
    private plugin: SceneCardsPlugin;
    private sceneManager: SceneManager;
    private inspectorComponent: InspectorComponent | null = null;
    private emptyEl: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: SceneCardsPlugin, sceneManager: SceneManager) {
        super(leaf);
        this.plugin = plugin;
        this.sceneManager = sceneManager;
    }

    getViewType(): string {
        return SCENE_INSPECTOR_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Scene Details';
    }

    getIcon(): string {
        return 'file-search';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('sl-scene-inspector-sidebar');

        // Inspector component container
        const inspectorEl = container.createDiv('story-line-inspector-panel sl-sidebar-inspector');
        inspectorEl.style.display = 'none';

        // Empty state
        this.emptyEl = container.createDiv('sl-scene-inspector-empty');
        this.emptyEl.createEl('p', { text: 'Open a scene file to see its details here.' });

        this.inspectorComponent = new InspectorComponent(
            inspectorEl,
            this.plugin,
            this.sceneManager,
            {
                onEdit: (scene) => {
                    const file = this.app.vault.getAbstractFileByPath(scene.filePath);
                    if (file instanceof TFile) {
                        this.app.workspace.getLeaf('tab').openFile(file);
                    }
                },
                onDelete: async (scene) => {
                    await this.sceneManager.deleteScene(scene.filePath);
                    this.updateForActiveFile();
                },
                onRefresh: () => this.updateForActiveFile(),
                onStatusChange: async (scene, status) => {
                    await this.sceneManager.updateScene(scene.filePath, { status });
                    this.updateForActiveFile();
                },
            }
        );

        // Listen for active file changes
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.updateForActiveFile();
            })
        );

        // Also refresh when files are modified (metadata changes)
        this.registerEvent(
            this.app.vault.on('modify', () => {
                // Debounced via the plugin's existing pipeline; just re-check
                setTimeout(() => this.updateForActiveFile(), 600);
            })
        );

        // Listen for Manuscript view focused-scene changes
        this.registerEvent(
            (this.app.workspace as any).on('storyline:manuscript-focus', (filePath: string) => {
                const scene = this.sceneManager.getScene(filePath);
                if (scene) {
                    if (this.emptyEl) this.emptyEl.style.display = 'none';
                    this.inspectorComponent?.show(scene);
                }
            })
        );

        // Initial update
        this.updateForActiveFile();
    }

    async onClose(): Promise<void> {
        this.inspectorComponent = null;
    }

    private updateForActiveFile(): void {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === 'md') {
            const scene = this.sceneManager.getScene(activeFile.path);
            if (scene) {
                if (this.emptyEl) this.emptyEl.style.display = 'none';
                this.inspectorComponent?.show(scene);
                return;
            }
        }
        // No scene found — show empty state
        this.inspectorComponent?.hide();
        if (this.emptyEl) this.emptyEl.style.display = 'block';
    }
}
