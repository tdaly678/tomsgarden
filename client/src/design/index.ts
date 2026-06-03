/**
 * Tomsgarden design system — public entry point.
 *
 * Import the stylesheet ONCE at app root (e.g. main.tsx):
 *   import '@/design/design-tokens.css';
 *   import '@/assets/textures/textures.css';
 *
 * Then pull tokens/components from here:
 *   import { TILE_COLORS, PlantTile, playCue } from '@/design';
 */
export * from './tokens';
export * from './sound-cues';
export { PlantTile } from '../assets/tiles/PlantTile';
export type { PlantTileProps } from '../assets/tiles/PlantTile';
export {
  PATTERN_ICONS,
  SaplingIcon,
  RobinIcon,
  LadybugIcon,
  SunflowerIcon,
  SnailIcon,
  BeehiveIcon,
} from '../assets/tiles/PatternIcons';
export type { PatternIconProps, PatternName } from '../assets/tiles/PatternIcons';
