import expect from 'expect';

import {
  selectExportablePhotoRegistrations,
  translatePhotoRegistrations,
} from './photoRegistrations';

/** A complete registration as the store holds one. */
const completeEntry = (cephImageId: string): PhotoRegistration => ({
  cephImageId,
  points: {
    Pn: { x: 120.5, y: 240.25 },
    "Pog'": { x: 110, y: 610 },
  },
  isFlipped: true,
});

describe('selectExportablePhotoRegistrations', () => {
  it('keeps a complete entry whose photo and ceph are both being written', () => {
    const selected = selectExportablePhotoRegistrations(
      { photo_1: completeEntry('ceph_1') },
      ['photo_1', 'ceph_1'],
    );
    expect(Object.keys(selected)).toEqual(['photo_1']);
    expect(selected.photo_1.cephImageId).toBe('ceph_1');
    expect(selected.photo_1.isFlipped).toBe(true);
    expect(selected.photo_1.points['Pn']).toEqual({ x: 120.5, y: 240.25 });
    expect(selected.photo_1.points["Pog'"]).toEqual({ x: 110, y: 610 });
  });

  it('omits an entry missing one of the two registration points', () => {
    const entry = completeEntry('ceph_1');
    entry.points = { Pn: entry.points['Pn'] };
    const selected = selectExportablePhotoRegistrations(
      { photo_1: entry },
      ['photo_1', 'ceph_1'],
    );
    expect(Object.keys(selected).length).toBe(0);
  });

  it('omits an entry with no ceph chosen yet', () => {
    const selected = selectExportablePhotoRegistrations(
      { photo_1: completeEntry('') },
      ['photo_1', 'ceph_1'],
    );
    expect(Object.keys(selected).length).toBe(0);
  });

  it('omits an entry whose ceph is not among the images being written', () => {
    const selected = selectExportablePhotoRegistrations(
      { photo_1: completeEntry('ceph_gone') },
      ['photo_1', 'ceph_1'],
    );
    expect(Object.keys(selected).length).toBe(0);
  });

  it('omits an entry whose photograph is not among the images being written', () => {
    const selected = selectExportablePhotoRegistrations(
      { photo_gone: completeEntry('ceph_1') },
      ['photo_1', 'ceph_1'],
    );
    expect(Object.keys(selected).length).toBe(0);
  });

  it('omits an entry whose point coordinates are not finite numbers', () => {
    const entry = completeEntry('ceph_1');
    entry.points['Pn'] = { x: NaN, y: 240 };
    const selected = selectExportablePhotoRegistrations(
      { photo_1: entry },
      ['photo_1', 'ceph_1'],
    );
    expect(Object.keys(selected).length).toBe(0);
  });
});

describe('translatePhotoRegistrations', () => {
  const idMap = {
    photo_1: 'minted_photo',
    ceph_1: 'minted_ceph',
  };

  it('translates both the photo key and the cephImageId through the map', () => {
    const translated = translatePhotoRegistrations(
      { photo_1: completeEntry('ceph_1') },
      idMap,
    );
    expect(Object.keys(translated)).toEqual(['minted_photo']);
    expect(translated.minted_photo.cephImageId).toBe('minted_ceph');
    expect(translated.minted_photo.isFlipped).toBe(true);
    // The clicked points are photo pixel coordinates — id translation must
    // carry them through untouched.
    expect(translated.minted_photo.points['Pn']).toEqual({ x: 120.5, y: 240.25 });
    expect(translated.minted_photo.points["Pog'"]).toEqual({ x: 110, y: 610 });
  });

  it('drops an entry whose photo id the map cannot resolve', () => {
    const translated = translatePhotoRegistrations(
      { photo_unknown: completeEntry('ceph_1') },
      idMap,
    );
    expect(Object.keys(translated).length).toBe(0);
  });

  it('drops an entry whose ceph id the map cannot resolve', () => {
    const translated = translatePhotoRegistrations(
      { photo_1: completeEntry('ceph_unknown') },
      idMap,
    );
    expect(Object.keys(translated).length).toBe(0);
  });

  it('drops the dangling entry and keeps the resolvable one', () => {
    const translated = translatePhotoRegistrations(
      {
        photo_1: completeEntry('ceph_1'),
        photo_unknown: completeEntry('ceph_1'),
      },
      idMap,
    );
    expect(Object.keys(translated)).toEqual(['minted_photo']);
  });
});
