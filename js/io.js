/**
 * io.js
 * Contrôleur des Entrées/Sorties (Import / Export).
 * Responsabilités : Export HTML autonome, Export MD réassemblé, déclenchement de l'EPUB,
 * et Import de fichiers .md/.txt par glisser-déposer ou via le bouton d'importation.
 */

(function() {
    'use strict';

    // Boutons d'export et d'import
    const btnExportEpub = document.getElementById('btn-export-epub');
    const btnExportHtml = document.getElementById('btn-export-html');
    const btnExportMd = document.getElementById('btn-export-md');
    const btnImport = document.getElementById('btn-import');
    const fileImport = document.getElementById('file-import');

    // Zone de drop (Éditeur)
    const editorElement = document.getElementById('markdown-editor');

    /**
     * Nettoie et formate le titre pour l'utiliser comme nom de fichier sécurisé.
     */
    function getSafeFilename(extension) {
        const state = window.AppStore.getState();
        let title = state.metadata.title || 'Livre_sans_titre';
        // CORRECTION : Restauration de la regex pour supprimer les caractères problématiques
        title = title.replace(//g, '').trim().replace(/\s+/g, '_');
        if (!title) title = 'export_livre';
        return `${title}.${extension}`;
    }

    /**
     * Vérifie si le livre contient des données valides avant un export.
     */
    function isBookValidForExport() {
        const state = window.AppStore.getState();
        if (!state.chapters || state.chapters.length === 0) {
            alert("Erreur : Le livre est totalement vide. Ajoutez au moins un chapitre pour exporter.");
            return false;
        }
        return true;
    }

    // ========================================================================
    // LOGIQUE D'EXPORT
    // ========================================================================

    /**
     * Export EPUB : Délègue au générateur et gère l'état de l'interface (blocage).
     */
    async function handleExportEpub() {
        if (!isBookValidForExport()) return;

        // Blocage de l'interface (comme spécifié dans les exigences)
        const originalText = btnExportEpub.textContent;
        btnExportEpub.textContent = "Génération...";
        btnExportEpub.disabled = true;
        document.body.style.cursor = 'wait';

        try {
            await window.EpubGenerator.generate();
        } finally {
            // Restauration de l'interface
            btnExportEpub.textContent = originalText;
            btnExportEpub.disabled = false;
            document.body.style.cursor = 'default';
        }
    }

    /**
     * Export HTML : Crée un fichier autonome (single-page) avec ancres et style embarqué.
     */
    function handleExportHtml() {
        if (!isBookValidForExport()) return;

        const state = window.AppStore.getState();
        const title = state.metadata.title || 'Livre sans titre';
        const author = state.metadata.author || 'Auteur inconnu';

        // 1. Génération de la table des matières
        let tocHtml = '<h2>Table des matières</h2>\n<ul>';
        state.chapters.forEach((chap, index) => {
            tocHtml += `<li><a href="#chap-${index}">${chap.title}</a></li>\n`;
        });
        tocHtml += '</ul>';

        // 2. Génération du corps des chapitres
        let bodyHtml = '';
        state.chapters.forEach((chap, index) => {
            const rawContent = window.AppStore.getChapterContent(chap.id);
            const renderedHtml = window.Parser.render(rawContent);
            // Suppression des data-source-line inutiles pour l'export final
            const cleanHtml = renderedHtml.replace(/data-source-line="\d+"/g, '');
            
            bodyHtml += `
            <section id="chap-${index}" class="chapter-section">
                <h1>${chap.title}</h1>
                ${cleanHtml}
            </section>
            <hr class="chapter-divider" />`;
        });

        // 3. Assemblage du document final
        const fullHtml = `<!DOCTYPE html>
<html lang="${state.metadata.language || 'fr'}">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        :root { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; }
        body { max-width: 800px; margin: 0 auto; padding: 2rem; }
        .title-page { text-align: center; margin: 20vh 0; }
        .title-page h1 { font-size: 3rem; margin-bottom: 0.5rem; }
        .title-page h2 { font-size: 1.5rem; font-weight: normal; color: #666; }
        .toc-page { page-break-after: always; margin-bottom: 4rem; }
        .chapter-section { margin-top: 4rem; page-break-before: always; }
        .chapter-section h1 { text-align: center; margin-bottom: 2rem; font-size: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
        .chapter-divider { border: 0; border-top: 2px dashed #ccc; margin: 4rem 0; }
        blockquote { border-left: 4px solid #ddd; padding-left: 1rem; color: #555; font-style: italic; }
        img { max-width: 100%; height: auto; }
        pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; border-radius: 4px; }
        code { font-family: monospace; background: #f4f4f4; padding: 0.2rem 0.4rem; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="title-page">
        <h1>${title}</h1>
        <h2>${author}</h2>
    </div>
    
    <div class="toc-page">
        ${tocHtml}
    </div>

    <div class="book-content">
        ${bodyHtml}
    </div>
</body>
</html>`;

        // CORRECTION : Restauration des crochets pour le constructeur Blob
        const blob = new Blob(, { type: "text/html;charset=utf-8" });
        saveAs(blob, getSafeFilename('html'));
    }

    /**
     * Export Markdown : Réassemble le livre entier en un seul fichier texte brut.
     */
    function handleExportMd() {
        if (!isBookValidForExport()) return;

        const state = window.AppStore.getState();
        
        // Préparation du tableau d'objets attendu par Parser.reassemble
        const chaptersData = state.chapters.map(chap => ({
            title: chap.title,
            content: window.AppStore.getChapterContent(chap.id)
        }));

        const fullMd = window.Parser.reassemble(chaptersData);
        
        // CORRECTION : Restauration des crochets pour le constructeur Blob
        const blob = new Blob(, { type: "text/markdown;charset=utf-8" });
        saveAs(blob, getSafeFilename('md'));
    }

    // ========================================================================
    // LOGIQUE D'IMPORT (DRAG & DROP ET CLIC)
    // ========================================================================

    /**
     * Fonction mutualisée pour valider et extraire le texte d'un fichier.
     */
    function processImportFile(file) {
        // Vérification de l'extension
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.md') && !fileName.endsWith('.txt')) {
            alert("Format non supporté. Veuillez sélectionner un fichier .md ou .txt.");
            return;
        }

        if (!confirm("Attention : L'importation de ce fichier remplacera intégralement votre livre actuel. Voulez-vous continuer ?")) {
            return;
        }

        const reader = new FileReader();
        reader.onload = function(event) {
            const content = event.target.result;
            
            // 1. Découpage du texte en chapitres (logique métier)
            const chaptersData = window.Parser.getChapters(content);
            
            if (chaptersData.length === 0) {
                alert("Aucun contenu valide trouvé dans le fichier.");
                return;
            }

            // 2. Importation dans le Store
            window.AppStore.importFullBook(chaptersData);
            
            // 3. Notification utilisateur
            alert(`Importation réussie ! ${chaptersData.length} chapitre(s) détecté(s) et chargé(s).`);
        };
        
        reader.onerror = function() {
            alert("Erreur lors de la lecture du fichier.");
        };

        reader.readAsText(file);
    }

    // -- Gestionnaires Drag & Drop --
    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        editorElement.style.border = '2px dashed var(--primary)';
        editorElement.style.backgroundColor = 'var(--highlight)';
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        editorElement.style.border = 'none';
        editorElement.style.backgroundColor = 'transparent';
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Restaure le style
        editorElement.style.border = 'none';
        editorElement.style.backgroundColor = 'transparent';

        const files = e.dataTransfer.files;
        if (files.length === 0) return;

        // CORRECTION : Restauration de l'index du tableau
        const file = files;
        processImportFile(file);
    }

    // ========================================================================
    // INITIALISATION DES ÉVÉNEMENTS
    // ========================================================================

    btnExportEpub.addEventListener('click', handleExportEpub);
    btnExportHtml.addEventListener('click', handleExportHtml);
    btnExportMd.addEventListener('click', handleExportMd);

    // Événements pour le nouveau bouton d'importation
    btnImport.addEventListener('click', () => {
        // Simule un clic sur l'input type="file" masqué
        fileImport.click();
    });

    fileImport.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            processImportFile(files);
            // Réinitialisation de la valeur pour permettre de réimporter le même fichier
            e.target.value = '';
        }
    });

    // Événements de Drag & Drop sur le textarea de l'éditeur
    editorElement.addEventListener('dragover', handleDragOver);
    editorElement.addEventListener('dragleave', handleDragLeave);
    editorElement.addEventListener('drop', handleDrop);

})();