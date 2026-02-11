// ============================================================
// Type declarations for iro.js color picker (loaded via CDN)
// ============================================================

declare namespace iro {
    class ColorPicker {
        constructor(selector: string, options: ColorPickerOptions);
        color: Color;
        on(event: string, callback: (color: Color) => void): void;
    }

    interface ColorPickerOptions {
        width?: number;
        color?: string;
        layout?: LayoutComponent[];
        display?: string;
    }

    interface LayoutComponent {
        component: unknown;
        options?: Record<string, unknown>;
    }

    interface Color {
        hexString: string;
    }

    namespace ui {
        const Wheel: unknown;
        const Slider: unknown;
        const Box: unknown;
    }
}
