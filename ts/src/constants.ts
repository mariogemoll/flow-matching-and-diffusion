export const DATA_POINT_RADIUS = 4;
export const NUM_SAMPLES = 256;
export const SAMPLED_POINT_RADIUS = 2.5;
export const SAMPLED_POINT_COLOR = 'rgba(255, 0, 0, 0.4)';

// Vector field visualization parameters
export const VECTOR_FIELD_MIN_ARROW_LENGTH = 3; // Minimum arrow length in pixels
export const VECTOR_FIELD_MAX_ARROW_LENGTH = 10; // Maximum arrow length in pixels
// Power scale: 1.0=linear, 0.5=sqrt, 0.3=more compressed
export const VECTOR_FIELD_COMPRESSION_EXPONENT = 0.25;
export const VECTOR_FIELD_COMPRESSION_MODE: 'power' | 'log' = 'log'; // 'power' or 'log'

