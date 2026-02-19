/**
 * editor.js
 * Contrôleur de l'éditeur Markdown.
 * Responsabilités : Gestion du textarea, calcul de la hauteur des lignes (wrapping) pour la gouttière,
 * synchronisation du scroll, gestion de la taille de police et statistiques en temps réel.
 */

(function() {
    'use strict';

    // Éléments du DOM
    const textarea = document.getElementById('markdown-editor');
    const lineNumbers = document.getElementById('line-numbers');
    const btnDecrease = document.getElementById('btn-font-decrease');
    const btnIncrease = document.getElementById('btn-font-increase');
    
    // Éléments de la barre de statut
    const statWordsCurrent = document.getElementById('stat-words-current');
    const statWordsTotal = document.getElementById('stat-words-total');
    const statSize = document.getElementById('stat-size');

    // État local de l'éditeur
    let currentFontSize = 14; // Doit correspondre à --editor-font-size dans le CSS
    const MIN_FONT_SIZE = 9;
    const MAX_FONT_SIZE = 22;

    // Élément fantôme pour mesurer la hauteur réelle des lignes (wrapping)
    let ghostElement;

    /**
     * Initialise l'élément fantôme avec les mêmes propriétés typographiques que le textarea.
     */
    function initGhostElement() {
        ghostElement = document.createElement('div');
        ghostElement.style.position = 'absolute';
        ghostElement.style.visibility = 'hidden';
        ghostElement.style.top = '-9999px';
        ghostElement.style.left = '-9999px';
        // Propriétés critiques pour reproduire le comportement du textarea
        ghostElement.style.whiteSpace = 'pre-wrap';
        ghostElement.style.wordWrap = 'break-word';
        ghostElement.style.border = 'none';
        ghostElement.style.padding = '0';
        
        document.body.appendChild(ghostElement);
    }

    /**
     * Synchronise le style du fantôme avec l'état actuel du textarea.
     */
    function syncGhostStyles() {
        const styles = window.getComputedStyle(textarea);
        ghostElement.style.fontFamily = styles.fontFamily;
        ghostElement.style.fontSize = styles.fontSize;
        ghostElement.style.lineHeight = styles.lineHeight;
        
        // La largeur du fantôme doit être exactement la largeur du contenu du textarea (sans padding)
        const paddingLeft = parseFloat(styles.paddingLeft);
        const paddingRight = parseFloat(styles.paddingRight);
        const contentWidth = textarea.clientWidth - paddingLeft - paddingRight;
        
        ghostElement.style.width = `${contentWidth}px`;
    }

    /**
     * Calcule et met à jour les numéros de ligne.
     */
    function updateLineNumbers() {
        syncGhostStyles();
        const lines = textarea.value.split('\n');
        let html = '';

        for (let i = 0; i < lines.length; i++) {
            // CORRECTION : Restauration de l'index du tableau
            // Un espace insécable est requis pour donner une hauteur aux lignes vides
            ghostElement.textContent = lines[i] || '\u200B';
            const height = ghostElement.getBoundingClientRect().height;
            html += `<div class="line-number-node" style="height: ${height}px;">${i + 1}</div>`;
        }

        lineNumbers.innerHTML = html;
        // Maintient la synchro du scroll après le redimensionnement
        lineNumbers.scrollTop = textarea.scrollTop; 
    }

    /**
     * Compte les mots d'une chaîne de caractères de manière fiable.
     */
    function countWords(str) {
        if (!str || str.trim() === '') return 0;
        return str.trim().split(/\s+/).length;
    }

    /**
     * Met à jour les statistiques dans le footer.
     */
    function updateStats() {
        // Sécurité en cas de non-initialisation du store
        if (!window.AppStore) return;

        const state = window.AppStore.getState();
        const currentText = textarea.value;
        
        // Mots du chapitre courant
        const currentWords = countWords(currentText);
        statWordsCurrent.textContent = `Chapitre : ${currentWords} mot(s)`;

        // Calcul des mots et de la taille totale du livre
        let totalWords = 0;
        let totalBytes = 0;

        state.chapters.forEach(chap => {
            // Si c'est le chapitre en cours d'édition, on prend la valeur "live" du textarea
            const content = (chap.id === state.currentChapterId) 
                ? currentText 
                : window.AppStore.getChapterContent(chap.id);
            
            totalWords += countWords(content);
            // CORRECTION : Restauration du tableau d'initialisation du Blob
            // Calcul approximatif de la taille en octets (UTF-8)
            totalBytes += new Blob([content]).size;
        });

        statWordsTotal.textContent = `Livre : ${totalWords} mot(s)`;
        statSize.textContent = `Taille : ${(totalBytes / 1024).toFixed(1)} Ko`;
    }

    /**
     * Modifie la taille de la police de l'éditeur et de la gouttière.
     */
    function changeFontSize(delta) {
        const newSize = currentFontSize + delta;
        if (newSize >= MIN_FONT_SIZE && newSize <= MAX_FONT_SIZE) {
            currentFontSize = newSize;
            document.documentElement.style.setProperty('--editor-font-size', `${currentFontSize}px`);
            // Un changement de police modifie la hauteur du wrapping, on doit recalculer
            requestAnimationFrame(updateLineNumbers);
        }
    }

    // ========================================================================
    // ÉVÉNEMENTS DOM ET APPSTORE
    // ========================================================================

    // 1. Initialisation
    initGhostElement();

    // 2. Écouteurs de frappe et de scroll
    textarea.addEventListener('input', () => {
        if (window.AppStore) {
            window.AppStore.updateCurrentChapterContent(textarea.value);
        }
        updateLineNumbers();
        updateStats();
    });

    textarea.addEventListener('scroll', () => {
        // Synchronisation stricte du défilement vertical entre la gouttière et le textarea
        lineNumbers.scrollTop = textarea.scrollTop;
    }, { passive: true });

    // Le recalcul des lignes est critique si la fenêtre change de taille (le wrapping change)
    window.addEventListener('resize', () => {
        requestAnimationFrame(updateLineNumbers);
    });

    // 3. Écouteurs pour la taille de police
    btnDecrease.addEventListener('click', () => changeFontSize(-1));
    btnIncrease.addEventListener('click', () => changeFontSize(1));

    // 4. Réaction aux événements de l'AppStore
    window.addEventListener('app:chapter-selected', (e) => {
        const chapterId = e.detail;
        const content = window.AppStore.getChapterContent(chapterId);
        textarea.value = content;
        
        // Remise à zéro du scroll lors du changement de chapitre
        textarea.scrollTop = 0; 
        
        updateLineNumbers();
        updateStats();
    });

    // Écouteur en cas d'import complet du livre
    window.addEventListener('app:book-imported', () => {
        const state = window.AppStore.getState();
        if (state.currentChapterId) {
            textarea.value = window.AppStore.getChapterContent(state.currentChapterId);
            textarea.scrollTop = 0;
            updateLineNumbers();
            updateStats();
        }
    });

})();