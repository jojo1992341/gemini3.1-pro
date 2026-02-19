/**
 * typography.js
 * Moteur de correction typographique et d'espacement Markdown.
 * Responsabilité unique : Appliquer les règles typographiques sur du texte brut sans altérer le code.
 */

(function() {
    'use strict';

    window.TypographyEngine = {

        /**
         * Vérifie si un caractère est alphanumérique (inclut les accents français).
         */
        isAlphanumeric(char) {
            // CORRECTION : Restauration de la regex alphanumérique avec support des accents
            return /^[A-Za-zÀ-ÖØ-öø-ÿ0-9]$/.test(char);
        },

        /**
         * Fonction principale de traitement du texte.
         * @param {string} text Le contenu Markdown brut d'un chapitre
         * @returns {string} Le contenu corrigé
         */
        process(text) {
            if (!text) return text;

            // 1. Extraction et protection des blocs de code et du code inline
            // On les remplace temporairement par des jetons uniques pour ne pas les altérer.
            const codePlaceholders = [];
            const extractRegex = /(```*?(?:```|$)|`+`)/g;
            
            let processedText = text.replace(extractRegex, (match) => {
                codePlaceholders.push(match);
                return `__CODE_BLOCK_${codePlaceholders.length - 1}__`;
            });

            // 2. Traitement ligne par ligne
            const lines = processedText.split('\n');
            let isDialogueOpen = false; // L'état persiste sur l'ensemble du texte ("sur toute la ligne")

            for (let i = 0; i < lines.length; i++) {
                // CORRECTION : Restauration de l'index du tableau
                let line = lines[i];

                // Si la ligne est uniquement un jeton de code protégé, on l'ignore
                if (/^__CODE_BLOCK_\d+__$/.test(line.trim())) {
                    continue;
                }

                // A. Correction des espaces superflus autour de l'emphase
                line = this.fixEmphasisSpaces(line);

                // B. Traitement des guillemets typographiques (caractère par caractère)
                let smartLine = '';
                for (let j = 0; j < line.length; j++) {
                    // CORRECTION : Restauration de l'index de la chaîne
                    let c = line[j];
                    
                    if (c === '«') {
                        isDialogueOpen = true;
                        smartLine += c;
                    } else if (c === '»') {
                        isDialogueOpen = false;
                        smartLine += c;
                    } else if (c === "'" || c === '"') {
                        // CORRECTION : Restauration des accès aux caractères précédent et suivant
                        let prev = j > 0 ? line[j - 1] : ' ';
                        let next = j < line.length - 1 ? line[j + 1] : ' ';
                        
                        // Détection de l'apostrophe interne
                        if (this.isAlphanumeric(prev) && this.isAlphanumeric(next)) {
                            smartLine += c; 
                        } else {
                            // Remplacement intelligent
                            if (isDialogueOpen) {
                                smartLine += '»';
                                isDialogueOpen = false;
                            } else {
                                smartLine += '«';
                                isDialogueOpen = true;
                            }
                        }
                    } else {
                        smartLine += c;
                    }
                }
                line = smartLine;

                // C. Réordonnancement strict : guillemets toujours à l'extérieur de l'emphase
                line = this.reorderMarkers(line);

                // CORRECTION : Restauration de l'index du tableau
                lines[i] = line;
            }

            processedText = lines.join('\n');

            // 3. Réinsertion des blocs de code originaux à la place des jetons
            processedText = processedText.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
                // CORRECTION : Restauration de l'accès au tableau via l'index parsé
                return codePlaceholders[parseInt(index, 10)];
            });

            return processedText;
        },

        /**
         * Supprime les espaces superflus à l'intérieur des marqueurs d'emphase.
         */
        fixEmphasisSpaces(line) {
            // Traitement de l'emphase forte (*** et **)
            line = line.replace(/(\*\*\*)\s+(.*?)\s+(\*\*\*)/g, '$1$2$3');
            line = line.replace(/(\*\*\*)\s+(.*?)(\*\*\*)/g, '$1$2$3');
            line = line.replace(/(\*\*\*)(.*?)\s+(\*\*\*)/g, '$1$2$3');

            line = line.replace(/(\*\*)\s+(.*?)\s+(\*\*)/g, '$1$2$3');
            line = line.replace(/(\*\*)\s+(.*?)(\*\*)/g, '$1$2$3');
            line = line.replace(/(\*\*)(.*?)\s+(\*\*)/g, '$1$2$3');

            // CORRECTION : Restauration de la regex de détection de liste non ordonnée
            // On cherche des espaces optionnels suivis d'un * puis d'un espace obligatoire
            let isList = /^\s*\*\s+/.test(line);
            if (isList) {
                // On remplace temporairement l'astérisque de la liste pour le protéger
                line = line.replace(/^(\s*)\*(\s+)/, '$1__LIST__$2');
            }

            line = line.replace(/(\*)\s+(.*?)\s+(\*)/g, '$1$2$3');
            line = line.replace(/(\*)\s+(.*?)(\*)/g, '$1$2$3');
            line = line.replace(/(\*)(.*?)\s+(\*)/g, '$1$2$3');

            // Restauration du marqueur de liste
            if (isList) {
                line = line.replace(/__LIST__/, '*');
            }

            return line;
        },

        /**
         * Force les guillemets à englober les marqueurs d'emphase.
         */
        reorderMarkers(line) {
            // Ordre décroissant : ***, **, *
            line = line.replace(/(\*\*\*)«/g, '«***');
            line = line.replace(/(\*\*)«/g, '«**');
            line = line.replace(/(\*)«/g, '«*');

            line = line.replace(/»(\*\*\*)/g, '***»');
            line = line.replace(/»(\*\*)/g, '**»');
            line = line.replace(/»(\*)/g, '*»');
            
            return line;
        }
    };

})();