// Kept in its own module so the animation features can be fetched as a chunk
// without pulling the rest of `motion/react` into the homepage's first load.
import { domAnimation } from 'motion/react';

export default domAnimation;
