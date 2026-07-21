export interface HeroImage {
  src: string;
  alt: string;
  domain: string;
}

export const heroImages: HeroImage[] = [
  {
    src: '/images/heroes/mechanical.jpg',
    alt: 'A robotic inspection system measuring a turbine component in a mechanical engineering laboratory',
    domain: 'Mechanical engineering',
  },
  {
    src: '/images/heroes/civil.jpg',
    alt: 'Structural sensors and a laser scanner monitoring a concrete bridge',
    domain: 'Civil engineering',
  },
  {
    src: '/images/heroes/chemical.jpg',
    alt: 'An instrumented pilot-scale reactor in a chemical engineering laboratory',
    domain: 'Chemical engineering',
  },
  {
    src: '/images/heroes/electrical.jpg',
    alt: 'A power electronics and measurement test bench in an electrical engineering laboratory',
    domain: 'Electrical engineering',
  },
  {
    src: '/images/heroes/computer.jpg',
    alt: 'Edge computers, embedded boards, and a machine-vision camera in a computer engineering laboratory',
    domain: 'Computer engineering',
  },
  {
    src: '/images/heroes/biomedical.jpg',
    alt: 'An instrumented robotic prosthetic hand in a biomedical engineering laboratory',
    domain: 'Biomedical engineering',
  },
  {
    src: '/images/heroes/systems.jpg',
    alt: 'Connected autonomous, sensing, control, and process equipment in a systems engineering laboratory',
    domain: 'Systems engineering',
  },
];
