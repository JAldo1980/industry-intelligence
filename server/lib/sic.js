// UK SIC 2007 divisions, and an approximate link from goods-producing divisions to HS trade chapters.
export const SIC_DIVISIONS = [
  ['01', 'Crop and animal production'], ['02', 'Forestry and logging'], ['03', 'Fishing and aquaculture'],
  ['05', 'Mining of coal and lignite'], ['06', 'Extraction of crude petroleum and natural gas'], ['07', 'Mining of metal ores'], ['08', 'Other mining and quarrying'], ['09', 'Mining support services'],
  ['10', 'Manufacture of food products'], ['11', 'Manufacture of beverages'], ['12', 'Manufacture of tobacco products'], ['13', 'Manufacture of textiles'], ['14', 'Manufacture of wearing apparel'], ['15', 'Manufacture of leather products'],
  ['16', 'Manufacture of wood products'], ['17', 'Manufacture of paper products'], ['18', 'Printing and reproduction of recorded media'], ['19', 'Manufacture of coke and refined petroleum'], ['20', 'Manufacture of chemicals'], ['21', 'Manufacture of pharmaceuticals'],
  ['22', 'Manufacture of rubber and plastic products'], ['23', 'Manufacture of non-metallic mineral products'], ['24', 'Manufacture of basic metals'], ['25', 'Manufacture of fabricated metal products'], ['26', 'Manufacture of computer, electronic and optical products'], ['27', 'Manufacture of electrical equipment'],
  ['28', 'Manufacture of machinery and equipment'], ['29', 'Manufacture of motor vehicles'], ['30', 'Manufacture of other transport equipment'], ['31', 'Manufacture of furniture'], ['32', 'Other manufacturing'], ['33', 'Repair and installation of machinery'],
  ['35', 'Electricity, gas, steam and air conditioning'], ['36', 'Water collection, treatment and supply'], ['37', 'Sewerage'], ['38', 'Waste collection, treatment and recycling'], ['39', 'Remediation and waste management'],
  ['41', 'Construction of buildings'], ['42', 'Civil engineering'], ['43', 'Specialised construction'],
  ['45', 'Motor vehicle trade and repair'], ['46', 'Wholesale trade'], ['47', 'Retail trade'],
  ['49', 'Land transport'], ['50', 'Water transport'], ['51', 'Air transport'], ['52', 'Warehousing and transport support'], ['53', 'Postal and courier activities'],
  ['55', 'Accommodation'], ['56', 'Food and beverage service'],
  ['58', 'Publishing'], ['59', 'Film, video, TV and music production'], ['60', 'Programming and broadcasting'], ['61', 'Telecommunications'], ['62', 'Computer programming and consultancy'], ['63', 'Information service activities'],
  ['64', 'Financial services'], ['65', 'Insurance and pension funding'], ['66', 'Auxiliary financial services'], ['68', 'Real estate'],
  ['69', 'Legal and accounting'], ['70', 'Head offices and management consultancy'], ['71', 'Architecture and engineering services'], ['72', 'Scientific research and development'], ['73', 'Advertising and market research'], ['74', 'Other professional and technical services'], ['75', 'Veterinary activities'],
  ['77', 'Rental and leasing'], ['78', 'Employment activities'], ['79', 'Travel and tour operators'], ['80', 'Security and investigation'], ['81', 'Building and landscape services'], ['82', 'Office and business support'],
  ['84', 'Public administration and defence'], ['85', 'Education'], ['86', 'Human health'], ['87', 'Residential care'], ['88', 'Social work'],
  ['90', 'Creative arts and entertainment'], ['91', 'Libraries, museums and culture'], ['92', 'Gambling and betting'], ['93', 'Sports and recreation'],
  ['94', 'Membership organisations'], ['95', 'Repair of computers and household goods'], ['96', 'Other personal services'],
];

const HS_BY_DIVISION = {
  '05': ['27'], '06': ['27'], '07': ['26'], '08': ['25'], 10: ['21', '19'], 11: ['22'], 12: ['24'], 13: ['52', '55'], 14: ['61', '62'], 15: ['42', '64'], 16: ['44'], 17: ['48'], 18: ['49'],
  19: ['27'], 20: ['29', '38'], 21: ['30'], 22: ['39', '40'], 23: ['69', '70'], 24: ['72', '76'], 25: ['73', '82'], 26: ['85', '90'], 27: ['85'], 28: ['84'], 29: ['87'], 30: ['88', '89'], 31: ['94'], 32: ['90', '95'],
};

export const divisionName = (div) => SIC_DIVISIONS.find(([d]) => d === String(div).padStart(2, '0'))?.[1] || null;
export const hsChaptersFor = (div) => HS_BY_DIVISION[String(div).padStart(2, '0')] || [];
