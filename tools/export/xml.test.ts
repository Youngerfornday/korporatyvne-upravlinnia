import { describe, expect, it } from 'vitest';
import { parseXml } from './test-support/xml-tree.ts';
import { cdata, cdataElement, element, emptyElement, escapeXmlText, serializeXml, textElement } from './xml.ts';

describe('xml', () => {
  it('екранує текст і атрибути', () => {
    expect(escapeXmlText('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d "e"');
    const xml = serializeXml(element('root', [textElement('item', 'a & <b>', { note: 'x "y" & z' })]));
    expect(xml).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<root><item note="x &quot;y&quot; &amp; z">a &amp; &lt;b&gt;</item></root>\n');
    expect(parseXml(xml).children[0]?.attributes.note).toBe('x "y" & z');
  });

  it('розриває CDATA на ]]>, щоб текст повернувся буквально', () => {
    expect(cdata('a]]>b')).toBe('<![CDATA[a]]]]><![CDATA[>b]]>');
    const xml = serializeXml(element('root', [cdataElement('text', 'x ]]> y ]]>')]));
    expect(parseXml(xml).children[0]?.text).toBe('x ]]> y ]]>');
  });

  it('недопустимі в XML символи й «--» у коментарі — помилка', () => {
    expect(() => escapeXmlText(`a${String.fromCharCode(1)}b`)).toThrow(/Недопустимий у XML символ U\+0001/);
    expect(() => cdata(String.fromCharCode(0xfffe))).toThrow(/U\+FFFE/);
    expect(() => serializeXml(element('root', []), { comment: 'a -- b' })).toThrow(/«--»/);
  });

  it('прості поля в один рядок, складені — з відступом; порожні елементи', () => {
    const tree = element('quiz', [
      element('name', [textElement('text', 'Назва')]),
      element('answer', [textElement('text', '1'), emptyElement('flag')], { fraction: '100' }),
      element('empty', []),
      element('wrapper', [element('inner', [textElement('a', '1'), textElement('b', '2')])]),
    ]);
    expect(serializeXml(tree, { comment: 'Коментар' })).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!-- Коментар -->',
        '<quiz>',
        '  <name><text>Назва</text></name>',
        '  <answer fraction="100">',
        '    <text>1</text>',
        '    <flag/>',
        '  </answer>',
        '  <empty></empty>',
        '  <wrapper>',
        '    <inner>',
        '      <a>1</a>',
        '      <b>2</b>',
        '    </inner>',
        '  </wrapper>',
        '</quiz>',
        '',
      ].join('\n'),
    );
  });
});

describe('тестовий парсер XML відхиляє некоректний XML', () => {
  it.each([
    ['<a><b></a>', /не відповідає/],
    ['<a>x & y</a>', /& без сутності/],
    ['<a>&nbsp;</a>', /невідома сутність/],
    ['<a b=1></a>', /в лапках/],
    ['<a>]]></a>', /поза CDATA/],
    ['<a></a><b></b>', /після кореневого/],
    ['<a>', /не закрито/],
    ['текст', /немає кореневого/],
    ['<a b="1" b="2"></a>', /повторюється/],
    ['<a><!-- x -- y --></a>', /усередині коментаря/],
    ['<a>&#1;</a>', /заборонений символ/],
  ])('%s', (source, message) => {
    expect(() => parseXml(source)).toThrow(message);
  });

  it('розбирає сутності, коментарі, інструкції обробки й порожні теги', () => {
    const root = parseXml('<?xml version="1.0"?>\n<!-- c --><a x=\'1\'><?pi x?><b/>&lt;&#1071;&#x44F;&apos;<!-- d --></a>\n');
    expect(root.attributes.x).toBe('1');
    expect(root.children.map((node) => node.name)).toEqual(['b']);
    expect(root.text).toBe('<Яя\'');
  });
});
