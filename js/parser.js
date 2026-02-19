/**
 * parser.js
 * Parseur Markdown et gestionnaire de structure du livre.
 * Responsabilités : Convertir le MD en HTML, injecter les numéros de ligne pour la synchro,
 * découper un texte brut en chapitres et réassembler les chapitres.
 */

(function() {
    'use strict';

    // Initialisation de markdown-it (chargé via CDN)
    // On active le HTML, la conversion automatique des liens et la gestion de la typographie de base
    const md = window.markdownit({
        html: false, // Sécurité : on n'autorise pas le HTML brut dans le Markdown
        breaks: true,
        linkify: true,
        typographer: false // Désactivé car notre propre TypographyEngine s'en charge mieux
    });

    /**
     * Plugin markdown-it personnalisé pour injecter les attributs data-source-line.
     * C'est cette astuce architecturale qui permettra à preview.js de savoir
     * exactement quel élément HTML correspond à quelle ligne de l'éditeur.
     */
    function injectLineNumbers(md) {
        md.core.ruler.push('source_lines', function (state) {
            state.tokens.forEach(function (token) {
                // Si le token est un élément de bloc et qu'il possède un mapping de lignes
                if (token.map && token.type !== 'inline') {
                    // map correspond à la ligne de début. 
                    // CORRECTION : Restauration de la syntaxe du tableau pour l'attribut HTML
                    token.attrPush(['data-source-line', String(token.map + 1)]);
                }
            });
        });
    }

    md.use(injectLineNumbers);

    window.Parser = {
        /**
         * Convertit le contenu d'un chapitre en HTML prêt pour la prévisualisation.
         */
        render(rawText) {
            if (!rawText) return '';
            
            // 1. Appliquer les corrections typographiques et d'espacement métier
            const processedText = window.TypographyEngine 
                ? window.TypographyEngine.process(rawText) 
                : rawText;
            
            // 2. Transformer en HTML avec les lignes source injectées
            return md.render(processedText);
        },

        /**
         * Découpe un texte Markdown complet en un tableau de chapitres.
         * Utilisé lors de l'import.
         */
        getChapters(fullText) {
            if (!fullText) return[];

            // Normalisation des sauts de ligne (Windows/Mac/Linux)
            const text = fullText.replace(/\r\n/g, '\n');
            const chapters =[];
            
            // CORRECTION : Restauration du point (.) pour capturer tous les caractères du titre
            const regex = /(?:^|\n)####\s+(.+)/g;
            let match;
            
            const firstMatch = regex.exec(text);
            
            if (firstMatch) {
                // S'il y a du texte AVANT le tout premier ####, on crée une Introduction
                const introText = text.substring(0, firstMatch.index).trim();
                if (introText.length > 0) {
                    chapters.push({ title: "Introduction", content: introText });
                }
                
                // CORRECTION : Restauration de l'index d'accès au groupe de capture
                let currentTitle = firstMatch.trim();
                let currentStartIndex = regex.lastIndex;
                
                // Parcours itératif des autres délimiteurs
                while ((match = regex.exec(text)) !== null) {
                    const content = text.substring(currentStartIndex, match.index);
                    chapters.push({ 
                        title: currentTitle, 
                        // Nettoyage des sauts de ligne extérieurs
                        content: content.replace(/^\n+/, '').replace(/\n+$/, '') 
                    });
                    
                    // CORRECTION : Restauration de l'accès au tableau
                    currentTitle = match.trim();
                    currentStartIndex = regex.lastIndex;
                }
                
                // Ajout du tout dernier chapitre après le dernier match
                const lastContent = text.substring(currentStartIndex);
                chapters.push({ 
                    title: currentTitle, 
                    content: lastContent.replace(/^\n+/, '').replace(/\n+$/, '') 
                });

            } else {
                // Aucun marqueur #### trouvé : tout le fichier est un chapitre unique
                if (text.trim().length > 0) {
                    chapters.push({ title: "Chapitre 1", content: text.trim() });
                }
            }
            
            return chapters;
        },

        /**
         * Réassemble l'arbre des chapitres en un seul texte Markdown.
         */
        reassemble(chaptersData) {
            if (!chaptersData || chaptersData.length === 0) return '';

            return chaptersData.map(chapter => {
                const title = `#### ${chapter.title}`;
                const content = chapter.content ? chapter.content.trim() : '';
                return content ? `${title}\n\n${content}` : title;
            }).join('\n\n\n');
        }
    };

})();