
export type Apartment = {
  id: string;
  address: string;
  neighborhood: string;
  monthlyRent: number;
  complaints: {
    rodents: number;
    bedbugs: number;
    heating: number;
    maintenance: number;
  };
};

export const mockApartments: Apartment[] = [
  {
    id: "apt-001",
    address: "123 Example Street, Manhattan, NY",
    neighborhood: "East Village",
    monthlyRent: 2800,
    complaints: {
      rodents: 8,
      bedbugs: 2,
      heating: 5,
      maintenance: 12,
    },
  },
  {
    id: "apt-002",
    address: "456 Sample Avenue, Brooklyn, NY",
    neighborhood: "Williamsburg",
    monthlyRent: 3200,
    complaints: {
      rodents: 1,
      bedbugs: 0,
      heating: 2,
      maintenance: 3,
    },
  },
  {
    id: "apt-003",
    address: "789 Demo Road, Queens, NY",
    neighborhood: "Astoria",
    monthlyRent: 2400,
    complaints: {
      rodents: 3,
      bedbugs: 1,
      heating: 7,
      maintenance: 4,
    },
  },
];
