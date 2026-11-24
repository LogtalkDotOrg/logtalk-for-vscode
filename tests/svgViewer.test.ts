import * as assert from 'assert';
import { SvgViewerProvider } from '../src/features/svgViewer';

suite('SVG Viewer Test Suite', () => {
  test('loads the SVG stylesheet from the diagram directory', () => {
    const svg = '<?xml-stylesheet href="diagrams.css" type="text/css"?><svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const html = SvgViewerProvider['getWebviewContent'](svg, 'https://file.vscode-cdn.net/diagrams', '/diagrams', false, 1, 'https://file.vscode-cdn.net');

    assert.ok(html.includes('<link rel="stylesheet" href="https://file.vscode-cdn.net/diagrams/diagrams.css">'));
    assert.ok(html.includes("style-src 'unsafe-inline' https://file.vscode-cdn.net;"));
    assert.ok(!html.includes('<?xml-stylesheet'));
  });

  test('does not add a stylesheet when the SVG has none', () => {
    const html = SvgViewerProvider['getWebviewContent']('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'https://file.vscode-cdn.net/diagrams', '/diagrams', false, 1, 'https://file.vscode-cdn.net');

    assert.ok(!html.includes('<link rel="stylesheet"'));
  });

  test('resolves CSS stylesheet paths and ignores non-CSS instructions', () => {
    const svg = '<?xml-stylesheet type="text/xsl" href="transform.xsl"?><?xml-stylesheet type="text/css" href="diagram%20styles.css?v=1"?><svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const html = SvgViewerProvider['getWebviewContent'](svg, 'https://file.vscode-cdn.net/diagrams', '/diagrams', false, 1, 'https://file.vscode-cdn.net');

    assert.ok(html.includes('href="https://file.vscode-cdn.net/diagrams/diagram%20styles.css?v=1"'));
    assert.ok(!html.includes('<link rel="stylesheet" href="https://file.vscode-cdn.net/diagrams/transform.xsl"'));
  });
});
