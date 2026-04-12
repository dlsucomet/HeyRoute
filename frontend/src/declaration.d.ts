/**
 * TypeScript declaration file for custom module declarations and global type definitions.
 */
declare module "*.png" {
  const value: any;
  export default value;
}

declare module "*.jpg" {
  const value: any;
  export default value;
}

declare module "*.jpeg" {
  const value: any;
  export default value;
}

declare module "@env" {
  export const GOOGLE_MAPS_API_KEY: string;
  export const SUPABASE_URL: string;
  export const SUPABASE_ANON_KEY: string;
  export const ASR_URL: string;
  export const MODEL_URL: string;
}