/**
 * chapters.js
 * Composant UI pour la gestion de la liste des chapitres (Barre latérale).
 * Responsabilités : Affichage, sélection, ajout, suppression, renommage inline
 * et réordonnancement (Drag & Drop via SortableJS).
 */

(function() {
    'use strict';

    const chapterList = document.getElementById('chapter-list');
    const btnAddChapter = document.getElementById('btn-add-chapter');
    const statChapters = document.getElementById('stat-chapters');

    let sortableInstance = null;

    /**
     * Met à jour le compteur de chapitres dans la barre de statut.
     */
    function updateChapterCount() {
        const state = window.AppStore.getState();
        statChapters.textContent = `${state.chapters.length} chapitre(s)`;
    }

    /**
     * Reconstruit entièrement le DOM de la liste des chapitres.
     */
    function renderChapterList() {
        const state = window.AppStore.getState();
        chapterList.innerHTML = '';

        state.chapters.forEach(chap => {
            const li = document.createElement('li');
            li.className = 'chapter-item';
            if (chap.id === state.currentChapterId) {
                li.classList.add('active');
            }
            li.setAttribute('data-id', chap.id);

            // Conteneur du titre (pour le double-clic)
            const titleSpan = document.createElement('span');
            titleSpan.className = 'chapter-title';
            titleSpan.textContent = chap.title;
            titleSpan.title = "Double-cliquez pour renommer";

            // Bouton de suppression
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'chapter-delete';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Supprimer ce chapitre';

            li.appendChild(titleSpan);
            li.appendChild(deleteBtn);
            chapterList.appendChild(li);
        });

        updateChapterCount();
    }

    /**
     * Active le mode édition (input inline) pour le titre d'un chapitre.
     */
    function enableEditMode(liElement, chapterId, currentTitle) {
        const titleSpan = liElement.querySelector('.chapter-title');
        if (!titleSpan) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'chapter-rename-input';
        input.value = currentTitle;

        // Remplace le texte par l'input
        liElement.replaceChild(input, titleSpan);
        
        // Focus et sélectionne tout le texte pour une frappe rapide
        input.focus();
        input.select();

        let isSaved = false;

        const save = () => {
            if (isSaved) return;
            isSaved = true;
            
            const newTitle = input.value.trim();
            if (newTitle === '') {
                // Titre vide refusé : on restaure l'ancien
                liElement.replaceChild(titleSpan, input);
            } else {
                // Demande à l'AppStore de valider et sauvegarder
                const success = window.AppStore.renameChapter(chapterId, newTitle);
                if (!success) {
                    liElement.replaceChild(titleSpan, input); // Restauration en cas d'échec
                }
            }
        };

        const cancel = () => {
            if (isSaved) return;
            isSaved = true;
            liElement.replaceChild(titleSpan, input);
        };

        // Gestion des touches du clavier
        input.addEventListener('keydown', (e) => {
            e.stopPropagation(); // Évite de déclencher des raccourcis globaux
            if (e.key === 'Enter') {
                e.preventDefault();
                save();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });

        // Validation sur la perte de focus
        input.addEventListener('blur', save);
    }

    /**
     * Initialise SortableJS pour le réordonnancement par Drag & Drop.
     */
    function initSortable() {
        if (sortableInstance) {
            sortableInstance.destroy();
        }
        
        sortableInstance = new Sortable(chapterList, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            delay: 100,
            delayOnTouchOnly: true,
            onEnd: () => {
                const newOrderIds = Array.from(chapterList.children).map(li => li.getAttribute('data-id'));
                window.AppStore.reorderChapters(newOrderIds);
            }
        });
    }

    // ========================================================================
    // ÉVÉNEMENTS DOM
    // ========================================================================

    chapterList.addEventListener('click', (e) => {
        const li = e.target.closest('.chapter-item');
        if (!li) return;

        const chapterId = li.getAttribute('data-id');

        if (e.target.closest('.chapter-delete')) {
            e.stopPropagation();
            const state = window.AppStore.getState();
            if (state.chapters.length <= 1) {
                alert("Impossible de supprimer le dernier chapitre du livre.");
                return;
            }
            if (confirm("Voulez-vous vraiment supprimer ce chapitre et tout son contenu ?\nCette action est irréversible.")) {
                window.AppStore.deleteChapter(chapterId);
            }
            return;
        }

        if (!e.target.classList.contains('chapter-rename-input')) {
            const state = window.AppStore.getState();
            if (state.currentChapterId !== chapterId) {
                window.AppStore.setCurrentChapter(chapterId);
            }
        }
    });

    chapterList.addEventListener('dblclick', (e) => {
        const titleSpan = e.target.closest('.chapter-title');
        if (titleSpan) {
            const li = titleSpan.closest('.chapter-item');
            const chapterId = li.getAttribute('data-id');
            enableEditMode(li, chapterId, titleSpan.textContent);
        }
    });

    btnAddChapter.addEventListener('click', () => {
        const state = window.AppStore.getState();
        window.AppStore.addChapter("Nouveau chapitre", state.currentChapterId);
    });

    // ========================================================================
    // ÉVÉNEMENTS APPSTORE
    // ========================================================================

    // CORRECTION : Restauration du tableau des événements qui nécessitent un re-rendu complet
    const eventsToRender =;
    eventsToRender.forEach(evt => {
        window.addEventListener(evt, () => {
            renderChapterList();
            initSortable();
        });
    });

    window.addEventListener('app:chapter-selected', (e) => {
        const selectedId = e.detail;
        Array.from(chapterList.children).forEach(li => {
            if (li.getAttribute('data-id') === selectedId) {
                li.classList.add('active');
            } else {
                li.classList.remove('active');
            }
        });
    });

    window.addEventListener('app:chapter-added', (e) => {
        const newChapter = e.detail;
        renderChapterList(); 
        initSortable();
        
        // CORRECTION : Restauration du Template Literal pour le sélecteur d'attribut
        const newLi = chapterList.querySelector(``);
        if (newLi) {
            window.AppStore.setCurrentChapter(newChapter.id);
            enableEditMode(newLi, newChapter.id, newChapter.title);
        }
    });

    window.addEventListener('app:chapter-renamed', (e) => {
        const updatedChapter = e.detail;
        // CORRECTION : Restauration du Template Literal
        const li = chapterList.querySelector(``);
        if (li) {
            const titleSpan = li.querySelector('.chapter-title');
            if (titleSpan) titleSpan.textContent = updatedChapter.title;
        }
    });

})();