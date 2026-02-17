// ============================================================
// Shared type definitions for PaintBar
// ============================================================

/** 2D point on the canvas */
export interface Point {
  x: number;
  y: number;
}

/** Firebase configuration object */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

/** User profile stored in Firestore */
export interface User {
  // Firebase Auth fields
  uid: string;
  email: string;

  // Profile fields
  username?: string;
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;

  // Social media handles
  githubUrl?: string;
  instagramHandle?: string;
  twitterHandle?: string;
  blueskyHandle?: string;

  // Blockchain
  hbarAddress?: string;

  // Gravatar
  useGravatar?: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/** User profile update payload (sent to API) */
export interface UserUpdate {
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;
  githubUrl?: string;
  instagramHandle?: string;
  twitterHandle?: string;
  blueskyHandle?: string;
  hbarAddress?: string;
  useGravatar?: boolean;
}

/** Canvas configuration options */
export interface CanvasOptions {
  width: number;
  height: number;
  responsive: boolean;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  isSquare: boolean;
}

/** Text tool state */
export interface TextState {
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  rotation: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  x: number;
  y: number;
}

/** Modal drag state */
export interface ModalDragState {
  active: boolean;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

/** RGBA color */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Save image format */
export type ImageFormat = "png" | "jpg" | "ico";

/** Triangle type */
export type TriangleType = "right" | "isosceles" | "equilateral";

/** Tool name */
export type ToolName =
  | "pencil"
  | "eraser"
  | "spray"
  | "fill"
  | "text"
  | "select"
  | "rectangle"
  | "circle"
  | "line"
  | "triangle"
  | "arc";

/** Canvas layer names */
export interface CanvasLayers {
  transparentBg: HTMLCanvasElement;
  opaqueBg: HTMLCanvasElement;
  drawing: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
}

/** Selection area */
export interface SelectionArea {
  x: number;
  y: number;
  width: number;
  height: number;
}
