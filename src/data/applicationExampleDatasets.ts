export interface DatasetDescriptor {
  label: string;
  detail: string;
  url?: string;
}

interface DatasetExample {
  ae_number: string;
  source_urls: string[];
}

const externalSources: Record<string, Omit<DatasetDescriptor, 'detail'>> = {
  'https://archive.ics.uci.edu/static/public/9/data.csv': {
    label: 'Auto MPG',
    url: 'https://archive.ics.uci.edu/dataset/9/auto+mpg',
  },
  'https://archive.ics.uci.edu/static/public/165/data.csv': {
    label: 'Concrete Compressive Strength',
    url: 'https://archive.ics.uci.edu/dataset/165/concrete+compressive+strength',
  },
  'https://archive.ics.uci.edu/static/public/179/data.csv': {
    label: 'SECOM manufacturing data',
    url: 'https://archive.ics.uci.edu/dataset/179/secom',
  },
  'https://archive.ics.uci.edu/static/public/198/data.csv': {
    label: 'Steel Plates Faults',
    url: 'https://archive.ics.uci.edu/dataset/198/steel+plates+faults',
  },
  'https://archive.ics.uci.edu/static/public/291/data.csv': {
    label: 'Airfoil Self-Noise',
    url: 'https://archive.ics.uci.edu/dataset/291/airfoil+self+noise',
  },
  'https://archive.ics.uci.edu/static/public/360/data.csv': {
    label: 'Air Quality',
    url: 'https://archive.ics.uci.edu/dataset/360/air+quality',
  },
  'https://archive.ics.uci.edu/static/public/421/aps+failure+at+scania+trucks.zip': {
    label: 'APS Failure at Scania Trucks',
    url: 'https://archive.ics.uci.edu/dataset/421/aps+failure+at+scania+trucks',
  },
  'https://archive.ics.uci.edu/static/public/601/data.csv': {
    label: 'AI4I 2020 Predictive Maintenance',
    url: 'https://archive.ics.uci.edu/dataset/601/ai4i+2020+predictive+maintenance+dataset',
  },
  'https://files.grouplens.org/datasets/movielens/ml-100k.zip': {
    label: 'MovieLens 100K',
    url: 'https://grouplens.org/datasets/movielens/100k/',
  },
  'https://github.com/pik1989/FBProphet/blob/main/DailyDelhiClimateTrain.csv': {
    label: 'Daily Delhi Climate',
    url: 'https://github.com/pik1989/FBProphet/blob/main/DailyDelhiClimateTrain.csv',
  },
  'https://raw.githubusercontent.com/batiukmaks/Steel-Strength-Prediction/main/steel_strength.csv': {
    label: 'Steel Strength Prediction',
    url: 'https://github.com/batiukmaks/Steel-Strength-Prediction',
  },
  'https://www.kaggle.com/datasets/adityakadiwal/water-potability': { label: 'Water Potability', url: 'https://www.kaggle.com/datasets/adityakadiwal/water-potability' },
  'https://www.kaggle.com/datasets/angelolmg/tilda-400-64x64-patches': { label: 'TILDA textile textures', url: 'https://www.kaggle.com/datasets/angelolmg/tilda-400-64x64-patches' },
  'https://www.kaggle.com/datasets/behrad3d/nasa-cmaps': { label: 'NASA C-MAPSS', url: 'https://www.kaggle.com/datasets/behrad3d/nasa-cmaps' },
  'https://www.kaggle.com/datasets/brjapon/cwru-bearing-datasets': { label: 'CWRU Bearing Dataset', url: 'https://www.kaggle.com/datasets/brjapon/cwru-bearing-datasets' },
  'https://www.kaggle.com/datasets/ignaciovinuales/battery-remaining-useful-life-rul': { label: 'Battery Remaining Useful Life', url: 'https://www.kaggle.com/datasets/ignaciovinuales/battery-remaining-useful-life-rul' },
  'https://www.kaggle.com/datasets/kaustubhdikshit/neu-surface-defect-database': { label: 'NEU Surface Defect Database', url: 'https://www.kaggle.com/datasets/kaustubhdikshit/neu-surface-defect-database' },
  'https://www.kaggle.com/datasets/uciml/pima-indians-diabetes-database': { label: 'Pima Indians Diabetes Database', url: 'https://www.kaggle.com/datasets/uciml/pima-indians-diabetes-database' },
  'https://www.kaggle.com/datasets/palbha/cmapss-jet-engine-simulated-data': { label: 'C-MAPSS Jet Engine Data', url: 'https://www.kaggle.com/datasets/palbha/cmapss-jet-engine-simulated-data' },
  'https://www.kaggle.com/datasets/programmer3/aging-bridge-shm-time-series-dataset': { label: 'Aging Bridge SHM Time Series', url: 'https://www.kaggle.com/datasets/programmer3/aging-bridge-shm-time-series-dataset' },
  'https://www.kaggle.com/datasets/programmer3/anomaly-detection-in-oil-and-gas-chemical-plants': { label: 'Oil and Gas Plant Anomaly Data', url: 'https://www.kaggle.com/datasets/programmer3/anomaly-detection-in-oil-and-gas-chemical-plants' },
  'https://www.kaggle.com/datasets/raminhuseyn/energy-consumption-dataset': { label: 'Energy Consumption Dataset', url: 'https://www.kaggle.com/datasets/raminhuseyn/energy-consumption-dataset' },
  'https://www.kaggle.com/datasets/safi842/highcarbon-micrographs': { label: 'High-Carbon Steel Micrographs', url: 'https://www.kaggle.com/datasets/safi842/highcarbon-micrographs' },
  'https://www.kaggle.com/datasets/edumagalhaes/quality-prediction-in-a-mining-process': { label: 'Quality Prediction in a Mining Process', url: 'https://www.kaggle.com/datasets/edumagalhaes/quality-prediction-in-a-mining-process' },
  'https://www.kaggle.com/datasets/vinayak123tyagi/bearing-dataset': { label: 'Bearing Degradation Dataset', url: 'https://www.kaggle.com/datasets/vinayak123tyagi/bearing-dataset' },
};

const notebookSources: Record<string, DatasetDescriptor> = {
  '6.6.4': { label: 'Generated in notebook', detail: 'Synthetic engineering data' },
  '9.2.5': { label: 'Defined in notebook', detail: 'Illustrative manufacturing data' },
  '10.2.6': { label: 'Generated in notebook', detail: 'Simulated sensor network data' },
  '11.3.2': { label: 'Simulated environment', detail: 'Adaptive cruise control' },
  '11.3.4': { label: 'Simulated environment', detail: 'Traffic intersection control' },
  '11.4.2': { label: 'Gymnasium CartPole environment', detail: 'Simulation environment', url: 'https://gymnasium.farama.org/environments/classic_control/cart_pole/' },
  '11.4.4': { label: 'Simulated environment', detail: 'Chemical reactor temperature control' },
  '11.5.2': { label: 'Simulated environment', detail: 'Battery management' },
  '11.5.4': { label: 'Simulated environment', detail: 'Robot arm control' },
  '11.5.5': { label: 'Simulated environment', detail: 'Adaptive cruise control' },
  '12.3.5': { label: 'Generated in notebook', detail: 'Synthetic sensor windows' },
  '12.6.10': { label: 'Built in notebook', detail: 'Cantilever-beam knowledge base' },
  '13.5.6': { label: 'Generated in notebook', detail: 'Simulated capacitor discharge data' },
  '13.5.7': { label: 'Generated in notebook', detail: 'Simulated mass-spring data' },
  '13.5.8': { label: 'Generated in notebook', detail: 'Physics-informed training points' },
  '14.3.3': { label: 'Generated in notebook', detail: 'Synthetic stress-strain observations' },
  '14.3.5': { label: 'Generated in notebook', detail: 'Synthetic stress-strain observations' },
  '14.5.3': { label: 'NASA C-MAPSS', detail: 'External dataset', url: 'https://www.kaggle.com/datasets/behrad3d/nasa-cmaps' },
  '14.6.5': { label: 'Generated in notebook', detail: 'Synthetic cantilever mesh cases' },
  '14.6.6': { label: 'OpenStreetMap road network', detail: 'External map data', url: 'https://www.openstreetmap.org/search?query=Santa%20Monica%20Pier' },
  '14.8.4': { label: 'Generated in notebook', detail: 'Simulated nonlinear-system data' },
  '14.8.5': { label: 'Provided to notebook', detail: 'PJME hourly load data' },
  '14.9.5': { label: 'Provided to notebook', detail: 'Engineering requirements and tool configuration' },
};

export function getApplicationExampleDataset(example: DatasetExample): DatasetDescriptor {
  const recordedSource = example.source_urls.find((source) => externalSources[source]);
  if (recordedSource) {
    return { ...externalSources[recordedSource], detail: 'External dataset' };
  }

  if (example.source_urls[0]) {
    return { label: 'External dataset source', detail: 'External dataset', url: example.source_urls[0] };
  }

  return notebookSources[example.ae_number] ?? {
    label: 'No external dataset',
    detail: 'Dataset details are recorded in the notebook',
  };
}
