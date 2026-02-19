/**
 * preview.js
 * Contrôleur de la prévisualisation et de la synchronisation de défilement.
 * Responsabilités : Rendre le HTML avec un debounce (280ms), synchroniser le curseur
 * de l'éditeur avec la prévisualisation et vice versa (mutuellement exclusif).
 */

(function() {
    'use strict';

    const textarea = document.getElementById('markdown-editor');
    const previewPanel = document.getElementById('preview-panel');
    const previewContent = document.getElementById('preview-content');
    const lineNumbers = document.getElementById('line-numbers');

    let renderTimeout = null;
    let syncLock = false; // Verrou pour éviter les boucles de synchronisation
    let currentHighlight = null; // Élément HTML actuellement en surbrillance

    /**
     * Rendu du contenu Markdown en HTML.
     */
    function renderPreview(content) {
        if (!content) {
            previewContent.innerHTML = '';
            return;
        }
        
        // Utilisation du parseur global qui injecte les data-source-line
        const html = window.Parser.render(content);
        previewContent.innerHTML = html;
    }

    /**
     * Planifie le rendu pour éviter de bloquer le thread principal à chaque frappe (280ms).
     */
    function debouncedRender(content) {
        if (renderTimeout) clearTimeout(renderTimeout);
        renderTimeout = setTimeout(() => {
            renderPreview(content);
        }, 280);
    }

    /**
     * Synchronisation : Éditeur -> Prévisualisation
     * Basé sur la position du curseur (ligne actuelle).
     */
    function syncEditorToPreview() {
        if (syncLock) return;

        // 1. Calcul de la ligne actuelle du curseur
        const textBeforeCursor = textarea.value.substring(0, textarea.selectionStart);
        const currentLine = textBeforeCursor.split('\n').length;

        // 2. Recherche de l'élément HTML correspondant (ou le plus proche parent précédent)
        // CORRECTION : Restauration du sélecteur d'attribut
        const elements = Array.from(previewContent.querySelectorAll('[data-source-line]'));
        if (elements.length === 0) return;

        let targetElement = elements[0];
        for (let i = 0; i < elements.length; i++) {
            // CORRECTION : Restauration de l'accès au tableau via l'index
            const lineAttr = parseInt(elements[i].getAttribute('data-source-line'), 10);
            if (lineAttr <= currentLine) {
                targetElement = elements[i];
            } else {
                break; // Les éléments étant dans l'ordre du DOM, on peut s'arrêter dès qu'on dépasse
            }
        }

        if (targetElement) {
            // Verrou activé
            syncLock = true;

            // Défilement doux vers l'élément
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Nettoyage de l'ancienne surbrillance
            if (currentHighlight) {
                currentHighlight.classList.remove('sync-highlight');
            }

            // Application de la nouvelle surbrillance
            targetElement.classList.add('sync-highlight');
            currentHighlight = targetElement;

            // Retrait de la surbrillance et libération du verrou après l'animation
            setTimeout(() => {
                targetElement.classList.remove('sync-highlight');
                if (currentHighlight === targetElement) currentHighlight = null;
                syncLock = false;
            }, 600); // 600ms laisse le temps au scroll smooth de se terminer
        }
    }

    /**
     * Synchronisation : Prévisualisation -> Éditeur
     * Basé sur le clic d'un élément dans le HTML.
     */
    function syncPreviewToEditor(event) {
        if (syncLock) return;

        // Cherche l'élément cliqué ou son parent le plus proche ayant l'attribut de ligne
        // CORRECTION : Restauration du sélecteur d'attribut
        const target = event.target.closest('[data-source-line]');
        if (!target) return;

        const lineNumber = parseInt(target.getAttribute('data-source-line'), 10);
        if (isNaN(lineNumber) || lineNumber < 1) return;

        // Verrou activé
        syncLock = true;

        // 1. Calcul de l'index du caractère correspondant au début de cette ligne
        const lines = textarea.value.split('\n');
        let charIndex = 0;
        for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
            // CORRECTION : Restauration de l'accès à la longueur de la ligne spécifique
            charIndex += lines[i].length + 1; // +1 pour le caractère \n
        }

        // 2. Déplacement du curseur dans l'éditeur
        textarea.focus();
        textarea.setSelectionRange(charIndex, charIndex);

        // 3. Calcul de la position de défilement exacte via la gouttière de l'éditeur
        if (lineNumbers.children.length >= lineNumber) {
            // CORRECTION : Restauration de l'accès à l'enfant cible
            const targetLineNode = lineNumbers.children[lineNumber - 1];
            // On centre la ligne dans la vue du textarea (scroll - moitié de la hauteur du conteneur)
            textarea.scrollTop = targetLineNode.offsetTop - (textarea.clientHeight / 2) + 20;
        }

        // Libération du verrou
        setTimeout(() => {
            syncLock = false;
        }, 100);
    }


    // ========================================================================
    // ÉVÉNEMENTS
    // ========================================================================

    // Déclencheurs de synchronisation Éditeur -> Preview
    textarea.addEventListener('keyup', syncEditorToPreview);
    textarea.addEventListener('mouseup', syncEditorToPreview);

    // Déclencheur de synchronisation Preview -> Éditeur
    previewContent.addEventListener('click', syncPreviewToEditor);

    // Écoute des mises à jour du contenu via l'AppStore
    window.addEventListener('app:content-updated', (e) => {
        const newContent = e.detail;
        debouncedRender(newContent);
    });

    // Rendu immédiat (sans debounce) lors d'un changement structurel
    window.addEventListener('app:chapter-selected', (e) => {
        const chapterId = e.detail;
        const content = window.AppStore.getChapterContent(chapterId);
        renderPreview(content);
        previewPanel.scrollTop = 0; // Remise à zéro
    });

    window.addEventListener('app:book-imported', () => {
        const state = window.AppStore.getState();
        if (state.currentChapterId) {
            const content = window.AppStore.getChapterContent(state.currentChapterId);
            renderPreview(content);
            previewPanel.scrollTop = 0;
        }
    });

})();