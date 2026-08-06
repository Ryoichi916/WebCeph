const analysesMap: { [id: string]: string } = {
  basic: 'Basic',
  common: 'Common',
  downs: 'Downs',
  steiner: 'Steiner',
  tweed: 'Tweed',
  ricketts: 'Ricketts',
  dental: 'Dental',
  bjork: 'Björk',
  jarabak: 'Jarabak',
  softTissues: 'Soft Tissues',
  wits: 'Wits & vertical',
};

export const getNameForAnalysis = (id: string) => {
  return analysesMap[id] || id;
};
