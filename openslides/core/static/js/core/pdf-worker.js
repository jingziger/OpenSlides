/* Worker for creating PDFs in a separate thread. The creation of larger PDFs
 * needs (currently) a lot of time and we don't want to block the UI.
 */

// Setup fake environment for pdfMake
var document = {
    'createElementNS': function () {
        return {};
    },
};
var window = this;

// PdfMake and Fonts
importScripts('/static/js/workers/pdf-worker-libs.js');

// Set default font family.
// To use custom ttf font files you have to replace the vfs_fonts.js file.
// See https://github.com/pdfmake/pdfmake/wiki/Custom-Fonts---client-side
// "PdfFont" is used as generic name in core/pdf.js. Adjust the four
// font style names only.
pdfMake.fonts = {
    PdfFont: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-Italic.ttf'
    }
};

// Function to replace layout placeholder
//
// Workaround for using table layout functions.
// TODO: Needs improvement of pdfmake's web worker support.
// Currently only functions are allowed for 'layout'.
// But functions cannot be passed to workers (via JSON).
var replacePlaceholder = function (content) {
    for (var i = 0; i < content.length; i++) {
        if (typeof content[i] === 'object') {

            // motion meta table border lines
            if (content[i].layout === "{{motion-placeholder-to-insert-functions-here}}") {
                content[i].layout = {
                    hLineWidth: function(i, node) {
                        return (i === 0 || i === node.table.body.length) ? 0 : 0.5;
                    },
                    vLineWidth: function() {
                        return 0;
                    },
                    hLineColor: function() {
                        return 'white';
                    }
                };
                return true;
            }

            // ballot paper crop marks
            if (content[i].layout === "{{ballot-placeholder-to-insert-functions-here}}") {
                content[i].layout = {
                    hLineWidth: function(i, node) {
                        if (i === 0){
                            return 0;
                        } else {
                            return 0.5;
                        }
                    },
                    vLineWidth: function(i, node) {
                        return (i === 0 || i === node.table.widths.length) ? 0 : 0.5;
                    },
                    hLineColor: function() {
                        return 'gray';
                    },
                    vLineColor: function() {
                        return 'gray';
                    }
                };
                return true;
            }
            replacePlaceholder(content[i]);
        }
    }
};

// Workaround for using dynamic footer with page number.
// TODO: Needs improvement of pdfmake's web worker support.
// see https://github.com/bpampuch/pdfmake/issues/38
var replaceFooter = function (doc) {
    if (doc.footerTpl) {
        doc.footer = function (currentPage, pageCount) {
            // One way to clone arrays/objects in js, that are serilizeable.
            var columns = JSON.parse(JSON.stringify(doc.footerTpl.columns));
            for (var i = 0; i < columns.length; i++) {
                if (columns[i].text) {
                    columns[i].text = columns[i].text
                    .replace('{{currentPage}}', currentPage)
                    .replace('{{pageCount}}', pageCount);
                }
            }
            return {
                columns: columns,
                margin: doc.footerTpl.margin,
            };
        };
    }
};

// Create PDF on message and return the base64 decoded document
self.addEventListener('message', function(e) {
    var data = JSON.parse(e.data);
    var doc = data.pdfDocument;

    replaceFooter(doc);
    replacePlaceholder(doc.content);

    var pdf = pdfMake.createPdf(doc);
    pdf.getBase64(function (base64) {
        if (data.filename) {
            self.postMessage(JSON.stringify({
                filename: data.filename,
                base64: base64
            }));
        } else {
            self.postMessage(base64);
        }
    });
}, false);
