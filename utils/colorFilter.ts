/**
 * Deuteranopia (red-green) color correction
 * All processing on-device — no internet required
 */

export interface FilterOption {
  id: string;
  label: string;
  description: string;
}

export const FILTERS: FilterOption[] = [
  {
    id: 'none',
    label: 'Original',
    description: 'No filter applied',
  },
  {
    id: 'deuteranopia',
    label: 'Red-Green Fix',
    description: 'Corrects red-green color confusion',
  },
  {
    id: 'enhance',
    label: 'Enhanced',
    description: 'Boosted contrast + red-green fix',
  },
];
