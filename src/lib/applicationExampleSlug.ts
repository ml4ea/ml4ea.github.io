interface SluggableApplicationExample {
  filename: string;
  ae_number: string;
  title: string;
}

const legacySlugs: Record<string, string> = {
  'Notebook-07.5.5-SVM-cwru-bearing.ipynb': 'svm-bearing-fault-classification',
  'Notebook-09.5.2-CNN-NEU-DET.ipynb': 'cnn-surface-defect-detection',
  'Notebook-12.3.5-VAE-SensorAnomaly.ipynb': 'vae-sensor-anomaly-detection',
};

const slugify = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export const applicationExampleSlug = (example: SluggableApplicationExample) =>
  legacySlugs[example.filename]
  ?? `ae-${example.ae_number.replaceAll('.', '-')}-${slugify(example.title)}`;
