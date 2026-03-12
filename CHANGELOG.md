# StoryLine — Changelog

---

## Version 1.7.0

### New Features

- **Series Mode** — Group multiple book projects into a shared series. Books in a series share a single Codex (characters, locations, and custom categories) so every entry is available across all books without duplication.

  - **Create Series** — Command palette → **Create Series from Current Project**. Wraps the active book in a new series folder, moves its Codex to the series level, and writes a `series.json` manifest.
  - **Add to Series** — Command palette → **Add Current Project to Series**. Discovers existing series in your vault and lets you pick one. The book folder moves into the series folder and its Codex entries are migrated into the shared Codex.
  - **Remove from Series** — Command palette → **Remove Current Project from Series**. Copies the shared Codex back into the book's local folder and moves the book out of the series folder.
  - **Series badge** — When the active project belongs to a series, the project selector toolbar shows a small badge with the series name and a library icon.
  - **Transparent to all views** — Characters, Locations, and Codex views automatically resolve to the series-level Codex folder when the active project belongs to a series. No changes needed in your workflow.
  - **Pre-flight check** — Before migration, StoryLine verifies that Obsidian's "Automatically update internal links" setting is enabled, so all `[[wikilinks]]` stay valid when files move.
  - **Safe file moves** — All file operations use Obsidian's `fileManager.renameFile()` to ensure links are updated vault-wide. Duplicate filenames in the destination are skipped with a notice.
  - **Settings → Project Management** — New section in the plugin settings tab with buttons for **Rename book**, **Create series from this book**, and **Manage series** — no need to use the command palette.
  - **Series Management Modal** — Accessible from Settings or the Open Project modal. View, rename, and reorder books within a series, add standalone books, or remove them.

  Series folder structure:
  ```
  StoryLine/
    My Series/
      series.json              ← Series manifest (name, book order)
      Codex/                   ← Shared across all books
        Characters/
        Locations/
        [Custom]/
      Book One.md
      Book One/
        Scenes/
        System/
      Book Two.md
      Book Two/
        Scenes/
        System/
  ```

---

## Version 1.6.0

### New Features

- **Stats View Rewrite** — The Stats dashboard has been completely rebuilt with eight collapsible sections for a cleaner, more organized layout. Click any section header to expand or collapse it.

  - **Overview** — Project word count with goal progress bar, estimated reading time, pace-to-deadline projection, and estimated completion date.
  - **Writing Sprint** — Session word count, duration, speed (wpm), streak, daily goal progress bar, and a 7-day sparkline.
  - **Writing History** — Daily bar chart with range selector (7d / 30d / 90d / All) showing words written per day.
  - **Progress Breakdown** — Word counts by status, by chapter (with outlier highlighting), and act balance stacked bars.
  - **Characters & World** — POV distribution, character scene coverage heatmap, and location frequency chart.
  - **Pacing & Tension** — Average scene length by act, word count distribution histogram, scene length outlier detection, dialogue vs. narrative ratio per scene, and tension curve.
  - **Prose Analysis** — Lazy-loaded section with Flesch-Kincaid readability scores, average sentence/word length, top 20 word frequency chart, and overused word warnings.
  - **Warnings** — Plot hole detection and validation warnings (unchanged).

- **Image Sticky Notes** — Corkboard notes can now hold images (maps, charts, reference art) instead of text. Click the **+ New Image Note** button in the corkboard toolbar, or drag an image from the vault file explorer or your desktop directly onto the canvas. Each image note supports an optional caption with full markdown and `[[wikilink]]` support — captions are included in link scanning. Right-click an image note to set, change, or remove the image. Click the image to open a fullscreen lightbox. Image notes can be resized and repositioned like regular sticky notes.

### Bug Fixes

- **Writing Tracker accuracy** — Fixed a bug where the "Today" word counter and "Session" counter could show the entire project word count instead of actual words written. The root cause was the tracker recording project totals as session words when the baseline wasn't properly initialized. The tracker now uses a null baseline that only activates after explicit initialization, includes lazy self-healing, and sanitizes corrupted daily history entries on startup.

- **Range button styling** — The 7d/30d/90d/All range buttons in Writing History are now styled as text links with hover effects instead of bordered buttons, matching the rest of the UI.

- **Manuscript View** — A Scrivenings-style continuous document view that displays all scenes as a single scrollable manuscript in reading order (act → chapter → sequence). Each scene is an embedded Live Preview editor — full editing with all Obsidian formatting (bold, italic, links, etc.) works inline. Scenes are separated by subtle dividers with title and status badge. Includes act and chapter headings, filter support, word count footer, and clickable scene titles to open individual files. Access via the new Manuscript tab (📖) in the view switcher between Plotlines and Codex.

- **Manuscript: Plain Text toggle** — A toolbar toggle that hides wiki-link underlines/colors, tag `#` prefixes, and other markup decorations so the manuscript reads like clean prose. Both links and tags appear as ordinary text while the toggle is active.

- **Manuscript: Lock Links toggle** — A toolbar toggle that makes wiki-links and tags non-editable (atomic). The cursor skips over link/tag text so you can't accidentally break link targets while editing. Both toggles are on by default.

- **Scene Details Sidebar** — A standalone sidebar panel that shows the full Inspector for the currently active scene file. Open it from the **Scene Details** button in the Navigator, or via the command palette (`Open Scene Details Sidebar`). Auto-updates when you switch between scene files in the editor, so you can view and edit metadata side-by-side with your writing.

- **Additional Source Folders (Experimental)** — Point StoryLine at any folder in your vault and it will recursively scan all `.md` files, automatically routing each one to the correct manager based on its frontmatter `type:` field (scene, character, location, world, or any codex category). Supports any folder structure — no need to organize files by entity type. Configure under **Settings → Advanced → Additional Source Folders** with a folder browser and autocomplete. ⚠ Experimental — back up your files before linking external folders.

### Improvements

- **Internal links in scene cards** — `[[wikilinks]]` in scene card conflict fields and Plotgrid cells now render as clickable links instead of plain text. Click to open the linked note.

- **Navigator "Scene Details" button** — A new button in the Navigator sidebar opens the Scene Details panel in the right sidebar with one click.

### Bug Fixes

- **Sequence renumbering on drag-reorder** — Fixed a bug where dragging a scene card to a new position in the Board view could produce inconsistent sequence numbers (e.g., 02-01, 02-02, 02-06). The algorithm now builds the correct insertion order first, then assigns clean 1..N sequences.

- **Corkboard double-click** — Fixed an issue where double-clicking a scene card on the corkboard did not open the scene file. The pointer capture used for drag was suppressing native click events.

---

## Version 1.5.0

### New Features

- **Codex Hub** — Characters and Locations now live inside a unified **Codex** view with tab-based navigation. Add your own custom categories (e.g., Props, Factions, Magic Systems) — each category gets its own folder, search, and detail pages. The Codex replaces the separate Characters and Locations tabs with a single, extensible hub.

- **Plotgrid Auto-Note** — Typing into an empty, unlinked Plotgrid cell now automatically creates a corkboard note and links it back to the cell. The note is created as an *idea* with a plotgrid-origin label (row / column) for easy tracking. Enabled by default; toggle on or off from the Plotgrid toolbar.

### Design Overhaul

The entire UI has been refined for a cleaner, less cluttered look:

- **Minimal tab navigation** — View mode toggles (Corkboard/Kanban, List/Subway, Grid/Map/Story Graph) now use a clean underline-tab style instead of bordered buttons.
- **Icon-only action buttons** — "New Character", "New World", and "New Location" buttons have been replaced with compact icon-only buttons with tooltips, freeing up toolbar space.
- **Streamlined toolbars** — Toolbar gaps and spacing have been tightened across all views for a more compact layout. 

### Improvements

- **Codex folder structure** — New projects now store Characters and Locations inside a `Codex/` folder. Existing projects with the old folder layout are detected and work without changes.
- **Codex search** — The Codex hub search now includes Characters, Locations, and any custom categories in its results.

### Bug Fixes

- **YAML frontmatter corruption** — Fixed an issue where invisible characters (zero-width non-joiners, byte order marks) could be inserted into frontmatter, breaking YAML parsing. All frontmatter is now sanitized on read and write.
- **Kanban rubber-banding** — Fixed an issue where Kanban columns could snap back after dragging if the underlying data hadn't finished saving.
- **Relationship Map scaling** — Fixed a rendering issue where the relationship map could appear at the wrong scale after switching views.
- **Story Graph scaling** — Fixed a similar scaling issue in the story graph visualization.
- **Location portrait layout** — Location detail portraits are now styled consistently with character portraits.
- **Codex hub category reset** — Fixed the category tabs sometimes resetting to the first tab when switching back to the hub.
- **Plotgrid left padding** — Fixed the first column in the Plot Grid being too close to the edge.

---

## Version 1.4.0

### New Features

- **Custom Field Templates** — Define your own reusable fields for character and location profiles. Add any fields you need beyond the built-in ones and they'll appear in every character or location editor.

- **Image Gallery** — Characters and locations now support a full image gallery (up to 10 images each) with a carousel, editable captions, and a floating lightbox viewer you can resize and drag around. Great for reference art, concept images, or mood boards.

- **Resizable Text Blocks** — All text fields in character and location detail views can now be resized by dragging the corner. No more squinting at tiny boxes.

- **Autocomplete & Tag Inputs** — Character, location, and tag fields now use autocomplete with a tag-pill style instead of plain text inputs. Start typing and pick from existing entries.

- **Chapter Titles & Descriptions** — Acts and chapters can now have descriptions in addition to labels. Right-click any act or chapter column header in the Board view and choose "Edit Description" to add notes about that section of your story. Descriptions appear as subtitles under column headers.

### Plotgrid Improvements

- **Act & Chapter Dividers** — The grid now shows colored divider bands when the act or chapter changes, with labels from your project structure. Makes it easy to see where story sections begin and end.

- **Status Color-Coding** — Scene rows show a colored left border matching their status (idea, outlined, draft, written, revised, final) so you can see progress at a glance.

- **Click to Open Files** — Click any scene row header to open its file. Click a column header to open the character or location file. Quick way to jump to your notes while working in the grid.

- **Shared Filters** — The Plotgrid now uses the same filter bar as the Board and Timeline views. Filter by status, act, chapter, POV, characters, locations, tags, or search text. Presets are shared across all views.

- **Tabbed Cell Inspector** — When a cell has a linked scene, the inspector panel now shows two tabs: **Cell** (cell content, detected links, and scan results) and **Scene** (the full scene editor with all fields). Switch between them to edit cell notes or scene details without leaving the grid.

### Improvements

- **Files open in preview mode** — Clicking to open a scene, character, or location file from anywhere in StoryLine now opens it in reading view by default, keeping frontmatter out of sight.

### Bug Fixes

- **POV dropdown staying open** — Fixed an issue where the POV autocomplete dropdown would keep reopening after being dismissed on empty fields.

- **Autocomplete cleanup** — Fixed a memory issue where autocomplete dropdowns weren't being properly cleaned up when fields were re-rendered.

---

## Version 1.3.2

### New Features

- **Story Navigator** — A compact sidebar panel for quick scene navigation. Search and filter scenes by title, sort by five modes (sequence, status, recent, words, title), filter by plotline with color-coded dots and scene counts, group by act with collapsible sections, pin scenes for quick access, and track progress with a bottom bar. Auto-opens when a project loads (configurable in settings) or via the command palette.

- **Sticky Note Themes** — Six built-in color themes for corkboard sticky notes: Classic, Pastel, Earth, Jewel, Neon, and Mono. Each provides 14 colors. Includes HSL sliders (hue shift, saturation, lightness) for fine-tuning and per-note color overrides via right-click.

- **Plotline HSL Sliders** — Fine-tune your entire plotline color palette with hue shift, saturation, and lightness sliders. Real-time swatch preview. Adjustments stack on top of the active scheme and per-tag overrides.

- **Per-Project Color Overrides** — Optionally save color scheme, HSL adjustments, and sticky note theme per project. Toggle "Use project-specific colors" in settings so each book can have its own look. Settings are stored in the project's `System/plotlines.json` and load automatically when switching projects.

### Improvements

- **Corkboard smoothness** — Improved drag performance with `requestAnimationFrame`, added inertia on release, and smoother zoom transitions.

- 

### Bug Fixes

- **Scene split placement** — Split scene now correctly preserves the sequence number for the first half instead of overwriting it. It also places the second split half under the first instead of at the end.

---

## Version 1.3.1

Version 1.3.1 fixes:

**Cascade Rename**
Renaming a character or location now updates all references across the project, with a confirmation modal.

**PlotGrid Editing**
Inspector textarea edits no longer get wiped by grid re-renders. Headers are also protected while editing.

**Family/Background Field**
Moved from "Basic Information" to the "Relationships" section in character view.

**Character Tagline Setting**
New setting to choose which field appears as the tagline on character cards.

**Scene Deselect on Save**
Selected scene stays selected after saving/refreshing in Board and Timeline views.

**Scene Rename in Inspector**
Editing a scene title in the inspector no longer causes the inspector to re-render mid-typing.

**Larger Textareas**
Description and Conflict fields increased from 4/2 rows to 12 rows each.
*Note that right clicking on a scene and choosing edit will open the scene and you can type as much as you like.*

**Split Scene Fix**
Split no longer deletes the first half. The split button was accidentally calling the delete handler instead of a refresh.

**More options for Location types.**

## Version 1.3.0

> **⚠️ Important — Back up your StoryLine folder before updating!**
> 
> This release includes a one-time automatic migration that moves per-project settings out of the shared `data.json` file and into individual `System/` files inside each project folder. This is a necessary change to make StoryLine work reliably across multiple devices (desktop, mobile, sync services).
> 
> The migration runs automatically on first launch and should be seamless, but as a precaution, **please make a copy of your entire `StoryLine/` folder** before installing version 1.3.0 — just in case something goes wrong.

### New Features

- **Corkboard View** — A new freeform corkboard layout in the Board view. Use sticky notes to brainstorm and capture your first ideas, then convert them into scenes when they're ready. Notes can be styled with different colors and support markdown. Pin notes and scene cards anywhere on a spatial canvas and drag them to rearrange. Toggle between the standard column layout Kanban and corkboard mode with a single click. Positions are saved per project.

- **DOCX Export** — Export your manuscript or outline as a `.docx` Word document, ready for editors, agents, or print formatting. Includes its own settings for page size, margins, font, and header styles. Works also on mobile.

- **PDF Export** — Export your project directly to PDF with styled formatting and section headers. Works on desktop via the built-in print engine. PDF export only works on desktop.

- **HTML Export** — Full HTML export with embedded styles for sharing or archiving your project as a standalone web page.

- **Browse for Project** — A new "Browse for Project…" button in the project selector lets you manually find and open any StoryLine project in your vault, including deeply nested series projects. Useful when projects aren't detected automatically (e.g. on mobile or after a fresh sync).

### Improvements

- **System file architecture** — Per-project data (tag colors, character aliases, plotgrid layout, corkboard positions, writing tracker history, filter presets) is now stored in `System/` JSON files inside each project folder instead of the shared plugin `data.json`. This eliminates sync conflicts when working across multiple devices and keeps project data portable.

- **Automatic migration** — On first launch, existing per-project data is automatically migrated from `data.json` to the new `System/` files. No manual steps required.

- **Project detection retry** — If no projects are found on startup (common on mobile where the file system may load slowly), StoryLine now retries up to three times with increasing delays before showing the project selector.

- **Recursive project scanning** — Project detection now scans subfolders recursively, so series projects nested several levels deep (e.g. `StoryLine/My Series/Book 1/Book 1.md`) are found automatically.

- **Default view setting** — Choose which view opens by default when launching StoryLine. Set your preferred starting view (Board, Timeline, Characters, etc.) in the plugin settings.

### Bug Fixes

- **Dropdown background fix** — Fixed a visual bug where dropdown menus (status, POV, filters) had transparent or incorrectly themed backgrounds, making them hard to read in certain themes.

- **Corkboard positions no longer stored in frontmatter** — Board positions are now saved in `System/board.json` instead of the project file's YAML frontmatter, preventing unnecessary file changes and sync noise.

- **Feature flags preserved during migration** — Global settings like series mode and export toggles are no longer accidentally removed when migrating per-project data.

- **Migration timing fix** — Resolved a race condition where settings could be saved before migration data was fully loaded into memory, which previously caused tag overrides and other project data to be lost.

---
