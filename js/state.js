/**
 * state.js
 * Gestionnaire d'état global, source de vérité et persistance multi-clés.
 * Responsabilités : CRUD des chapitres, gestion du localStorage, autosave (debounce 700ms).
 */

(function() {
    'use strict';

    // Clés de stockage
    const STORAGE_KEY_META = 'epub_editor_meta';
    const STORAGE_KEY_CHAPTER_PREFIX = 'epub_editor_chapter_';

    // État interne en mémoire
    let state = {
        metadata: {
            title: '',
            author: '',
            language: 'fr'
        },
        chapters:[], // Array d'objets: { id: string, title: string }
        currentChapterId: null,
        contents: {}  // Dictionnaire mémoire des contenus: { "id": "texte markdown..." }
    };

    let saveTimeout = null;

    /**
     * Génère un UUID v4 pour garantir l'unicité des chapitres (nécessaire pour l'EPUB).
     */
    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // CORRECTION : Restauration de la regex //g qui avait été tronquée
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(//g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Émet un événement global pour notifier l'UI.
     */
    function emit(eventName, detail = {}) {
        window.dispatchEvent(new CustomEvent(`app:${eventName}`, { detail }));
    }

    /**
     * Sauvegarde immédiate dans le localStorage avec gestion des orphelins et quotas.
     */
    function saveToStorage() {
        try {
            // 1. Sauvegarde des métadonnées et de l'arbre des chapitres
            const metaToSave = {
                metadata: state.metadata,
                chapters: state.chapters,
                currentChapterId: state.currentChapterId
            };
            localStorage.setItem(STORAGE_KEY_META, JSON.stringify(metaToSave));

            // 2. Sauvegarde des contenus (un chapitre = une clé)
            state.chapters.forEach(chap => {
                // CORRECTION : Restauration de l'accès dynamique
                const content = state.contents || '';
                localStorage.setItem(STORAGE_KEY_CHAPTER_PREFIX + chap.id, content);
            });

            // 3. Nettoyage des clés orphelines (chapitres supprimés)
            const validKeys = new Set(state.chapters.map(c => STORAGE_KEY_CHAPTER_PREFIX + c.id));
            validKeys.add(STORAGE_KEY_META);
            
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith(STORAGE_KEY_CHAPTER_PREFIX) && !validKeys.has(key)) {
                    localStorage.removeItem(key);
                }
            }
            
            emit('saved'); // Notifie que la sauvegarde est effective (pour la barre de statut)
        } catch (error) {
            console.error('Erreur de sauvegarde locale', error);
            if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                alert("⚠️ Attention : L'espace de stockage de votre navigateur est plein. Veuillez exporter votre livre immédiatement pour ne pas perdre vos données.");
            }
        }
    }

    /**
     * Déclenche une sauvegarde avec un délai (Debounce 700ms) pour éviter de saturer le stockage à chaque frappe.
     */
    function debouncedSave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveToStorage, 700);
    }

    // ========================================================================
    // API PUBLIQUE (window.AppStore)
    // ========================================================================
    window.AppStore = {
        /**
         * Initialise l'état au chargement de l'application.
         */
        init() {
            const savedMeta = localStorage.getItem(STORAGE_KEY_META);
            
            if (savedMeta) {
                try {
                    const parsed = JSON.parse(savedMeta);
                    state.metadata = parsed.metadata || state.metadata;
                    state.chapters = parsed.chapters ||[];
                    state.currentChapterId = parsed.currentChapterId;
                    
                    // Chargement des contenus
                    state.chapters.forEach(chap => {
                        const content = localStorage.getItem(STORAGE_KEY_CHAPTER_PREFIX + chap.id);
                        // CORRECTION : Restauration de
                        state.contents = content !== null ? content : '';
                    });
                } catch (e) {
                    console.error("Erreur de parsing des métadonnées", e);
                }
            }

            // Si le livre est totalement vide, on crée un premier chapitre
            if (state.chapters.length === 0) {
                this.addChapter("Chapitre 1", null, true);
            } else if (!state.currentChapterId || !state.chapters.find(c => c.id === state.currentChapterId)) {
                // Si l'ID courant est invalide, on sélectionne le premier
                // CORRECTION : Restauration de l'index
                state.currentChapterId = state.chapters.id;
            }

            emit('state-loaded', this.getState());
        },

        getState() {
            return { ...state };
        },

        getChapterContent(id) {
            // CORRECTION : Restauration de l'accès
            return state.contents || '';
        },

        updateMetadata(key, value) {
            // CORRECTION : Restauration de l'accès dynamique
            if (state.metadata !== undefined) {
                state.metadata = value;
                debouncedSave();
            }
        },

        updateCurrentChapterContent(newContent) {
            if (!state.currentChapterId) return;
            // CORRECTION : Restauration de l'accès
            state.contents = newContent;
            debouncedSave();
            emit('content-updated', newContent);
        },

        setCurrentChapter(id) {
            if (state.chapters.find(c => c.id === id)) {
                state.currentChapterId = id;
                saveToStorage(); 
                emit('chapter-selected', id);
            }
        },

        addChapter(title, afterId = null, skipSave = false) {
            const newId = generateUUID();
            const newChapter = { id: newId, title: title };
            
            // CORRECTION : Restauration de l'accès
            state.contents = '';

            const insertIndex = state.chapters.findIndex(c => c.id === afterId);
            if (insertIndex !== -1) {
                state.chapters.splice(insertIndex + 1, 0, newChapter);
            } else {
                state.chapters.push(newChapter);
            }

            if (!skipSave) {
                saveToStorage();
                emit('chapter-added', newChapter);
            }
            return newId;
        },

        renameChapter(id, newTitle) {
            if (!newTitle || newTitle.trim() === '') return false;
            const chapter = state.chapters.find(c => c.id === id);
            if (chapter) {
                chapter.title = newTitle.trim();
                saveToStorage();
                emit('chapter-renamed', chapter);
                return true;
            }
            return false;
        },

        deleteChapter(id) {
            if (state.chapters.length <= 1) {
                alert("Impossible de supprimer le dernier chapitre restant.");
                return false;
            }

            const index = state.chapters.findIndex(c => c.id === id);
            if (index !== -1) {
                state.chapters.splice(index, 1);
                // CORRECTION : Restauration de
                delete state.contents;

                // Si on a supprimé le chapitre courant, on bascule sur le précédent (ou le premier)
                if (state.currentChapterId === id) {
                    const newCurrentIndex = Math.max(0, index - 1);
                    // CORRECTION : Restauration de l'index
                    state.currentChapterId = state.chapters.id;
                }

                saveToStorage();
                emit('chapter-deleted', { deletedId: id, newCurrentId: state.currentChapterId });
                return true;
            }
            return false;
        },

        reorderChapters(newOrderIds) {
            const newChapters =[];
            newOrderIds.forEach(id => {
                const chap = state.chapters.find(c => c.id === id);
                if (chap) newChapters.push(chap);
            });

            if (newChapters.length === state.chapters.length) {
                state.chapters = newChapters;
                saveToStorage();
                emit('chapters-reordered', state.chapters);
            }
        },

        importFullBook(newChaptersData) {
            state.chapters =[];
            state.contents = {};

            newChaptersData.forEach((data, index) => {
                const id = generateUUID();
                state.chapters.push({ id, title: data.title });
                // CORRECTION : Restauration de l'accès
                state.contents = data.content;
                if (index === 0) state.currentChapterId = id;
            });

            saveToStorage();
            emit('book-imported', this.getState());
        }
    };

})();