import { describe, expect, test } from 'vitest';
import { parseXml, type XmlNode } from '../test-support/xml-tree.ts';
import { LAUNCH_FILE, scormManifestXml, type ScormManifestInput } from './manifest.ts';

const INPUT: ScormManifestInput = {
  id: 'p01-matrytsia-modelei',
  title: 'П1. Матриця моделей & «рубрика» <90%>',
  organizationTitle: 'Корпоративне управління',
  masteryPercent: 90,
  files: ['assets/app.js', 'index.html', 'fonts/OFL.txt', 'assets/app.css'],
};

function child(node: XmlNode | undefined, name: string): XmlNode {
  const found = node?.children.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`немає <${name}> у <${node?.name}>`);
  return found;
}

describe('scormManifestXml', () => {
  test('produces well-formed SCORM 1.2 content packaging with one SCO', () => {
    // Act
    const root = parseXml(scormManifestXml(INPUT));

    // Assert
    expect(root.name).toBe('manifest');
    expect(root.attributes['identifier']).toBe('ku-scorm-p01-matrytsia-modelei');
    expect(root.attributes['xmlns']).toBe('http://www.imsproject.org/xsd/imscp_rootv1p1p2');
    expect(root.attributes['xmlns:adlcp']).toBe('http://www.adlnet.org/xsd/adlcp_rootv1p2');
    const metadata = child(root, 'metadata');
    expect(child(metadata, 'schema').text).toBe('ADL SCORM');
    expect(child(metadata, 'schemaversion').text).toBe('1.2');

    const organizations = child(root, 'organizations');
    const organization = child(organizations, 'organization');
    expect(organizations.attributes['default']).toBe(organization.attributes['identifier']);
    expect(child(organization, 'title').text).toBe('Корпоративне управління');
    const item = child(organization, 'item');
    expect(child(item, 'title').text).toBe(INPUT.title);
    expect(child(item, 'adlcp:masteryscore').text).toBe('90');

    const resource = child(child(root, 'resources'), 'resource');
    expect(item.attributes['identifierref']).toBe(resource.attributes['identifier']);
    expect(resource.attributes).toMatchObject({ type: 'webcontent', 'adlcp:scormtype': 'sco', href: LAUNCH_FILE });
    expect(resource.children.map((file) => file.attributes['href'])).toEqual(['index.html', 'assets/app.css', 'assets/app.js', 'fonts/OFL.txt']);
  });

  test('keeps fractional mastery scores', () => {
    expect(scormManifestXml({ ...INPUT, masteryPercent: 62.5 })).toContain('<adlcp:masteryscore>62.5</adlcp:masteryscore>');
  });

  test.each([
    [{ id: 'P01 matrix' }, /Некоректний ID/],
    [{ masteryPercent: 101 }, /поза межами/],
    [{ masteryPercent: Number.NaN }, /поза межами/],
    [{ files: ['assets/app.js'] }, /не містить index.html/],
    [{ files: ['index.html', '/abs/app.js'] }, /Некоректний шлях/],
    [{ files: ['index.html', '../app.js'] }, /Некоректний шлях/],
    [{ files: ['index.html', 'https://cdn.example/app.js'] }, /Некоректний шлях/],
    [{ files: ['index.html', 'imsmanifest.xml'] }, /Некоректний шлях/],
  ])('rejects invalid input %j', (patch, message) => {
    expect(() => scormManifestXml({ ...INPUT, ...patch })).toThrow(message);
  });
});
