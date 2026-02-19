/**
 * epub.js
 * Moteur de génération d'archives EPUB 3 (compatibilité EPUB 2).
 * Responsabilités : Construire la structure OEBPS, l'OPF, le NCX, convertir le HTML en XHTML valide,
 * zipper le tout en mémoire sans compression pour le mimetype, et déclencher le téléchargement.
 */

(function() {
    'use strict';

    /**
     * Génère un UUID v4 pour l'identifiant unique du livre.
     */
    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // CORRECTION : Restauration de la regex //g
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(//g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Nettoie le HTML issu de markdown-it pour en faire un XHTML 1.1 strict.
     * Les liseuses crashent si le XML est malformé.
     */
    function sanitizeToXHTML(html) {
        // CORRECTION : Restauration de la regex pour supprimer les numéros de ligne
        let xhtml = html.replace(/data-source-line="\d+"/g, '');
        
        // CORRECTION : Restauration de la regex pour forcer la fermeture des balises HTML vides (br, hr, img)
        xhtml = xhtml.replace(/<(br|hr|img)(*?)(?<!\/)>/gi, '<$1$2 />');
        
        return xhtml;
    }

    /**
     * Squelette de base pour tous les fichiers XHTML de l'EPUB.
     */
    function getXHTMLTemplate(title, bodyContent, lang) {
        return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
${bodyContent}
</body>
</html>`;
    }

    window.EpubGenerator = {

        /**
         * Orchestre la génération complète de l'EPUB.
         */
        async generate() {
            // Sécurité si l'AppStore a échoué à s'initialiser
            if (!window.AppStore) return;

            const state = window.AppStore.getState();
            
            if (!state.chapters || state.chapters.length === 0) {
                alert("Erreur : Le livre est vide. Ajoutez au moins un chapitre pour exporter.");
                return;
            }

            // Récupération des métadonnées avec valeurs par défaut
            const title = state.metadata.title.trim() || 'Livre sans titre';
            const author = state.metadata.author.trim() || 'Auteur inconnu';
            const lang = state.metadata.language.trim() || 'fr';
            
            // Format ISO 8601 pour la date de publication
            const dateISO = new Date().toISOString().split('.') + 'Z';
            const uuid = `urn:uuid:${generateUUID()}`;

            const zip = new JSZip();

            // 1. Fichier mimetype (Doit être le premier, non compressé selon la spec EPUB)
            zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

            // 2. META-INF/container.xml (Pointe vers l'OPF)
            const containerXML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`;
            zip.folder("META-INF").file("container.xml", containerXML);

            const oebps = zip.folder("OEBPS");

            // 3. Feuille de style commune
            const cssContent = `
body { font-family: serif; line-height: 1.6; margin: 5%; text-align: justify; }
h1, h2, h3 { font-family: sans-serif; color: #333; }
h1 { text-align: center; margin-bottom: 2em; page-break-before: always; }
h4.separator { text-align: center; margin: 2em 0; border-top: 1px solid #ccc; padding-top: 1em; }
blockquote { border-left: 2px solid #666; padding-left: 1em; margin-left: 0; font-style: italic; }
img { max-width: 100%; height: auto; }
            `;
            oebps.file("style.css", cssContent);

            // 4. Construction de la table des matières (NCX et Navigation EPUB 3)
            let ncxNavPoints = '';
            let epub3NavList = '';
            let opfManifest = `
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="titlepage" href="title.xhtml" media-type="application/xhtml+xml"/>
        <item id="css" href="style.css" media-type="text/css"/>`;
            let opfSpine = `
        <itemref idref="titlepage"/>
        <itemref idref="toc"/>`;

            // Page de titre
            const titlePageHtml = `<div style="text-align: center; margin-top: 20vh;">
                <h1 style="font-size: 2.5em;">${title}</h1>
                <h2 style="font-size: 1.5em; font-weight: normal;">${author}</h2>
            </div>`;
            oebps.file("title.xhtml", getXHTMLTemplate(title, titlePageHtml, lang));

            // Parcours des chapitres
            state.chapters.forEach((chap, index) => {
                const playOrder = index + 1;
                const fileId = `chapter_${playOrder}`;
                const fileName = `${fileId}.xhtml`;
                const safeTitle = chap.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                // Nav NCX (EPUB 2)
                ncxNavPoints += `
        <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
            <navLabel><text>${safeTitle}</text></navLabel>
            <content src="${fileName}"/>
        </navPoint>`;

                // Nav EPUB 3 (XHTML)
                epub3NavList += `<li><a href="${fileName}">${safeTitle}</a></li>\n`;

                // OPF Registration
                opfManifest += `\n        <item id="${fileId}" href="${fileName}" media-type="application/xhtml+xml"/>`;
                opfSpine += `\n        <itemref idref="${fileId}"/>`;

                // Contenu du chapitre
                const rawContent = window.AppStore.getChapterContent(chap.id);
                const htmlContent = window.Parser.render(rawContent);
                const xhtmlContent = sanitizeToXHTML(htmlContent);
                
                // On ajoute systématiquement le h1 avec le titre du chapitre en tête
                const bodyContent = `<h1>${safeTitle}</h1>\n${xhtmlContent}`;
                oebps.file(fileName, getXHTMLTemplate(safeTitle, bodyContent, lang));
            });

            // 5. Génération du toc.ncx
            const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
        <meta name="dtb:uid" content="${uuid}"/>
        <meta name="dtb:depth" content="1"/>
        <meta name="dtb:totalPageCount" content="0"/>
        <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle><text>${title.replace(/&/g, '&amp;')}</text></docTitle>
    <docAuthor><text>${author.replace(/&/g, '&amp;')}</text></docAuthor>
    <navMap>${ncxNavPoints}
    </navMap>
</ncx>`;
            oebps.file("toc.ncx", ncxContent);

            // 6. Génération du toc.xhtml (Navigation EPUB 3)
            const tocHtml = `<h1>Table des matières</h1>
<nav epub:type="toc" id="toc">
    <ol>
        ${epub3NavList}
    </ol>
</nav>`;
            oebps.file("toc.xhtml", getXHTMLTemplate("Table des matières", tocHtml, lang));

            // 7. Génération de l'OPF (content.opf)
            const opfContent = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:identifier id="pub-id">${uuid}</dc:identifier>
        <dc:title>${title.replace(/&/g, '&amp;')}</dc:title>
        <dc:creator>${author.replace(/&/g, '&amp;')}</dc:creator>
        <dc:language>${lang}</dc:language>
        <dc:date>${dateISO}</dc:date>
        <meta property="dcterms:modified">${dateISO}</meta>
    </metadata>
    <manifest>${opfManifest}
    </manifest>
    <spine toc="ncx">${opfSpine}
    </spine>
</package>`;
            oebps.file("content.opf", opfContent);

            // 8. Compression et téléchargement
            try {
                const blob = await zip.generateAsync({ 
                    type: "blob",
                    mimeType: "application/epub+zip",
                    compression: "DEFLATE",
                    compressionOptions: { level: 9 }
                });

                // CORRECTION : Restauration de la regex de nettoyage du nom de fichier
                let fileName = title.replace(//g, '').trim().replace(/\s+/g, '_');
                if (!fileName) fileName = 'livre';
                
                saveAs(blob, `${fileName}.epub`);
                
            } catch (err) {
                console.error("Erreur lors de la création de l'EPUB :", err);
                alert("Une erreur est survenue lors de la création du fichier EPUB.");
            }
        }
    };

})();