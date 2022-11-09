
class Matcap_Render {

    // ...............................................................................................................

    constructor(size_px = 512) {

      this.size_px = size_px;

      const orange_colors_rgb = {
        black: [0, 0, 0],
        bright: [255, 105, 55],
        dark: [160, 45, 5],
        shadow: [80, 55, 95],
        highlight: [255, 220, 175]
      };

      this.image_data = this._create_matcap_image(orange_colors_rgb);
    }

    // ...............................................................................................................

    display = (canvas_ref) => {
        
      // If we're given a canvas id, make sure to convert it to an element
      let canvas_elem = canvas_ref;
      if (typeof(canvas_ref) === "string") canvas_elem = document.getElementById(canvas_ref);

      canvas_elem.width = this.size_px;
      canvas_elem.height = this.size_px;
      const ctx = canvas_elem.getContext("2d");
      ctx.putImageData(this.image_data, 0, 0);

      return;
    }

    // ...............................................................................................................

    _create_matcap_image = (colors_rgb) => {

      // Create (invisible!) canvas for drawing image data
      const canvas = document.createElement("canvas");
      canvas.width = this.size_px;
      canvas.height = this.size_px;
      const ctx = canvas.getContext("2d");

      // Main fill gradient
      const fill_pos = {y: 0.25, r0: 0, r1: 1.5};
      const soft_fill = this._colorstops(colors_rgb.bright, colors_rgb.dark);
      this._draw_gradient(ctx, fill_pos, soft_fill);

      // Highlight
      const highlight_pos = {y: 0.5, r0: 0.15, r1: 1.25};
      const top_highlight = this._colorstops(colors_rgb.highlight, colors_rgb.bright, 0.6, 0);
      this._draw_gradient(ctx, highlight_pos, top_highlight);

      // Lower shadow
      const shadow_pos = { y: 0.6, r0: 0.8, r1: 1.5 };
      const bot_shadow = this._colorstops(colors_rgb.bright, colors_rgb.shadow, 0, 1)
      this._draw_gradient(ctx, shadow_pos, bot_shadow);
      
      // Create circular cutout
      const circ_rad = 1.005;
      const circ_pos = { r0: circ_rad, r1: circ_rad*1.01 };
      const circle_cutout = this._colorstops(colors_rgb.black, colors_rgb.shadow, 0, 1);
      this._draw_gradient(ctx, circ_pos, circle_cutout);

      const image_data = ctx.getImageData(0, 0, this.size_px, this.size_px);

      canvas.remove();

      return image_data;
    }

    // ...............................................................................................................

    _colorstops = (rgb_start, rgb_end, a_start = 1, a_end = 1) => {

      /*
      Simple colorstop maker, intended for use with the 'draw_gradients' function
      Creates 2 colorstops from 0 to 1 (in gradient units), with the given
      rgb start/end values and optionally, alpha start/end values
      */

      const [r0, g0, b0] = rgb_start;
      const [r1, g1, b1] = rgb_end;

      const color_stop_0 = [0, `rgba(${r0}, ${g0}, ${b0}, ${a_start})`];
      const color_stop_1 = [1, `rgba(${r1}, ${g1}, ${b1}, ${a_end})`];

      return [color_stop_0, color_stop_1];
    }

    // ...............................................................................................................

    _draw_gradient = (ctx_ref, relative_position, color_stops_list, blend_mode = "source-over") => {

      // Build full position info, using defaults for missing data
      const default_position = { x: 0, y: 0, r0: 0, r1: 1 };
      const relpos = {...default_position, ...relative_position};

      // For clarity. Convert from relative units to pixels
      const half_size_px = this.size_px / 2.0;
      const x_px = (relpos.x + 1) * half_size_px;
      const y_px = (1 - relpos.y) * half_size_px;
      const r0_px = relpos.r0 * half_size_px;
      const r1_px = relpos.r1 * half_size_px;

      // Make the gradient
      const gradient = ctx_ref.createRadialGradient(x_px, y_px, r0_px, x_px, y_px, r1_px);
      for(let [t, color] of color_stops_list) {
        gradient.addColorStop(t, color);
      }

      // Draw the gradient
      ctx_ref.globalCompositeOperation = blend_mode;
      ctx_ref.fillStyle = gradient;
      ctx_ref.fillRect(0, 0, this.size_px, this.size_px);
      ctx_ref.globalCompositeOperation = "source-over";

      return;
    }

    // ...............................................................................................................

  }
