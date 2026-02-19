/**
 * main.js
 * Orchestrateur principal de l'application.
 * Responsabilités : Initialisation au démarrage, liaison des métadonnées avec le Store,
 * et gestion du basculement de thème (clair/sombre) persistant.
 */

(function() {
    'use strict';

    // Éléments du DOM (Métadonnées du livre)
    const inputTitle = document.getElementById('meta-title');
    const inputAuthor = document.getElementById('meta-author');
    const inputLanguage = document.getElementById('meta-language');
    
    // Éléments du DOM (Thème)
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    const htmlRoot = document.documentElement;

    // Clé de stockage locale indépendante pour le thème visuel
    const THEME_STORAGE_KEY = 'epub_editor_theme';

    /**
     * Applique visuellement le thème et le sauvegarde dans les préférences du navigateur.
     */
    function applyTheme(themeName) {
        htmlRoot.setAttribute('data-theme', themeName);
        localStorage.setItem(THEME_STORAGE_KEY, themeName);
    }

    /**
     * Bascule la valeur du thème actuel.
     */
    function toggleTheme() {
        const currentTheme = htmlRoot.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme(newTheme);
    }

    /**
     * Initialise le thème au démarrage en fonction de l'historique ou du système.
     */
    function initTheme() {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'dark' || savedTheme === 'light') {
            applyTheme(savedTheme);
        } else {
            // Repli sur la préférence système de l'OS s'il n'y a pas d'historique
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            applyTheme(prefersDark ? 'dark' : 'light');
        }
    }

    // ========================================================================
    // LIAISON DE DONNÉES (DATA-BINDING) : VUE -> STORE
    // ========================================================================

    inputTitle.addEventListener('input', (e) => {
        window.AppStore.updateMetadata('title', e.target.value);
    });

    inputAuthor.addEventListener('input', (e) => {
        window.AppStore.updateMetadata('author', e.target.value);
    });

    inputLanguage.addEventListener('input', (e) => {
        window.AppStore.updateMetadata('language', e.target.value);
    });

    btnThemeToggle.addEventListener('click', toggleTheme);

    // ========================================================================
    // INITIALISATION : STORE -> VUE
    // ========================================================================

    // Remplissage des champs de métadonnées lorsque le Store a terminé de charger les sauvegardes
    window.addEventListener('app:state-loaded', (e) => {
        const state = e.detail;
        if (state.metadata) {
            if (state.metadata.title) inputTitle.value = state.metadata.title;
            if (state.metadata.author) inputAuthor.value = state.metadata.author;
            if (state.metadata.language) inputLanguage.value = state.metadata.language;
        }
    });

    // Démarrage de l'application
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        
        // Le lancement de l'initialisation du Store est la seule action nécessaire.
        // Cela va lire le localStorage et déclencher les événements qui mettront à jour
        // automatiquement la liste des chapitres, l'éditeur et la prévisualisation.
        window.AppStore.init();
    });

})();