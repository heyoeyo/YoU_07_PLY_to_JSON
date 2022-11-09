class WireframeRenderer {

    // ...............................................................................................................

    constructor(canvas_elem_id) {

      // Get access to context for webgl calls
      this.canvas = document.getElementById(canvas_elem_id);
      this.ctx = this.canvas.getContext("2d", { "willReadFrequently": true } );
      if (this.ctx === null) { 
        alert("Error setting up canvas! Cannot render wireframe");
        return;
      }

      // Sizing info, needed for mapping normalized coordinates to pixels
      const render_px = Math.pow(2, Math.round(Math.log2(screen.width)));
      this.canvas.width = render_px;
      this.canvas.height = render_px;
      this.w_px = render_px;
      this.h_px = render_px;
      this._color = "rgb(0, 0, 0)";
      this._base_line_width = render_px / 512;
      this._base_vert_size = render_px / 128;

      // Variables for shading style
      this._shade_vertices = false;
      this._shade_faces = true;
      this._shade_triangles = false;

      // Variables used to manage rendering
      this._enabled = true;
      this._image_cache = {};
      this._loop_handler = new Nonblocking_ForLoop();

      // Wipe out canvas data on start up just to be sure
      this._clear_canvas();
    }

    // ...............................................................................................................

    _clear_canvas = () => this.ctx.clearRect(0, 0, this.w_px, this.h_px);
    enable = (enable_wireframe) => this._enabled = enable_wireframe;
    reset = () => this._image_cache = {};

    // ...............................................................................................................

    set_shade_style = (shade_select) => {

      // Default everything off, since we only want 1 active anyways
      this._shade_vertices = false;
      this._shade_faces = false;
      this._shade_triangles = false;

      // Pick the correct 'active' shading, with face shading as the fallback
      const shade_check = String(shade_select).toLowerCase();
      if (shade_check.includes("tri")) {
        this._shade_triangles = true;
      } else if (shade_check.includes("vert")) {
        this._shade_vertices = true;
      } else {
        this._shade_faces = true;
      }

      return;
    }

    // ...............................................................................................................

    render = (data_ref) => {

      this._clear_canvas();

      // Bail if there is no uv data
      if (!data_ref.has.uvs) {
        this._render_no_uvs_message();
        return;
      }
      
      // Stop any in-progress rendering
      this._loop_handler.cancel();

      // If wireframe is disabled we're done!
      if (!this._enabled) return;

      // Figure out render scaling
      const num_faces = data_ref.counts.face;
      const small_model_scale = Math.max(1, num_faces / 1000);
      const large_model_scale = Math.log2(num_faces) - 5;
      const model_scale = Math.min(small_model_scale, large_model_scale);

      // Render in non-blocking way
      this._loop_handler = new Nonblocking_ForLoop();
      if (this._shade_vertices) {
      this._render_vertices(data_ref, model_scale);
      } else if (this._shade_faces) {
        this._render_faces(data_ref, model_scale);
      } else if (this._shade_triangles) {
        this._render_triangles(data_ref, model_scale);
      } else {
        console.error("Error selecting wireframe shading! Vertices/faces/triangles not selected!");
      }

      return;
    }

    // ...............................................................................................................

    _render_from_cache = (cache_key) => {

      /* Function used to display an already completed uv image, from cache */

      const has_key = (cache_key in this._image_cache);
      if (has_key) {
        const cache_image = this._image_cache[cache_key];
        this.ctx.putImageData(cache_image, 0, 0);
      }

      return has_key;
    }

    // ...............................................................................................................

    _save_to_cache = (cache_key) => {

      /* Function used to store completed uv images in cache for quicker re-renders in the future */

      this._image_cache[cache_key] = this.ctx.getImageData(0, 0, this.w_px, this.h_px);

      return;
    }

    // ...............................................................................................................

    _render_no_uvs_message = () => {
      
      /* Function used to draw a message indicating that there is no uv data for drawing wireframe */

      this._clear_canvas();
      
      // For clarity
      const font_size = Math.round(this.w_px * 1.5 / 10);
      const line_width = Math.round(this.w_px / 200);
      const x_cen = this.w_px / 2;
      const y_cen = this.h_px / 2;
      const y_pad = Math.round(font_size * 0.75);
      const max_text_width = Math.round(this.w_px * 0.8);

      // Set text styling
      this.ctx.font = `${font_size}px monospace`;
      this.ctx.textAlign = "center";
      this.ctx.strokeStyle = this._color;
      this.ctx.lineWidth = line_width;
      this.ctx.strokeText("no uv data", x_cen, y_cen - y_pad, max_text_width);
      this.ctx.strokeText("available", x_cen, y_cen + y_pad, max_text_width);

      return;
    }

    // ...............................................................................................................

    _render_vertices = async(data_ref, scale_factor) => {

      // Render from cache if possible
      const cache_key = "vertices";
      const is_cached = this._render_from_cache(cache_key);
      if (is_cached) return;

      // Set up loop state data for drawing vertices
      const vert_size = this._base_vert_size / scale_factor;
      const state = {
        ctx: this.ctx,
        w_px: this.w_px,
        h_px: this.h_px,
        vert_size: vert_size,
        vert_offset: vert_size / 2.0,
        uv_data: data_ref.uvs.vert
      }

      // Draw one rectangle for each vertex
      const draw_one_vertex = (vert_idx, s) => {

        // Figure out the uv pixel coordinates
        const uv_idx = 2 * vert_idx;
        const [uvx, uvy] = s.uv_data.subarray(uv_idx, uv_idx + 2);
        const uvx_px = s.w_px * uvx;
        const uvy_px = s.h_px * (1.0 - uvy);
        
        // Draw square at each vertex location
        s.ctx.beginPath();
        s.ctx.fillRect(uvx_px - s.vert_offset, uvy_px - s.vert_offset, s.vert_size, s.vert_size);
        s.ctx.closePath();

        return;
      };
      
      // Set drawing style
      this.ctx.fillStyle = this._color;

      // Run (non-blocking) loop!
      const num_verts_to_render = data_ref.counts.attr;
      const [loop_ok, _, time_ms] = await this._loop_handler.run(num_verts_to_render, state, draw_one_vertex);
      this._log_render_time(cache_key, time_ms);

      // Save finished image to cache
      if (loop_ok) this._save_to_cache(cache_key);
      
      return;
    }

    // ...............................................................................................................

    _render_faces = async(data_ref, scale_factor) => {

      // Render from cache if possible
      const cache_key = "faces";
      const is_cached = this._render_from_cache(cache_key);
      if (is_cached) return;

      // Set up loop state data for drawing faces
      const state = {
        ctx: this.ctx,
        w_px: this.w_px,
        h_px: this.h_px,
        uv_data: data_ref.uvs.vert,
        triangles_per_face: data_ref.tris_per_face,
        uv_array_offset: 0
      }

      // Draw one polygon for each face (but skipping triangle diagonals)
      const draw_one_face = (face_idx, s) => {

        // Get the number of triangles making up each face
        const num_tris = s.triangles_per_face[face_idx];

        // Due to original 'triangle fan' ordering, we need to grab data in a funny way to get back faces...
        // -> For 1 triangle we need to grab 3 uvs
        // -> For 2 triangles, we need 6 uvs (we use the 0, 1, 2, 5 indexes to draw the quad)
        // -> For 3 triangles, we need 9 uvs (we use 0, 1, 2, 5, 8)
        // -> For 4 triangles, we need 12 uvs (we use 0, 1, 2, 5, 8, 11), etc.
        const num_verts_to_grab = 3 * num_tris;
        const num_data_to_grab = 2 * num_verts_to_grab;
        const uv_face_data = s.uv_data.subarray(s.uv_array_offset, s.uv_array_offset + num_data_to_grab);
        s.uv_array_offset += num_data_to_grab;

        // Allocate storage for pixel-unit version of uv coordinates
        const verts_in_face = 2 + num_tris;
        const uv_px = new Array(verts_in_face);

        // Get triangle uvs in pixels
        for (let uv_idx = 0; uv_idx < 3; uv_idx++) {
          const xy_idx = 2 * uv_idx;
          const [uvx, uvy] = uv_face_data.subarray(xy_idx, xy_idx + 2);
          const uvx_px = s.w_px * uvx;
          const uvy_px = s.h_px * (1.0 - uvy);
          uv_px[uv_idx] = [uvx_px, uvy_px];
        }

        // Get any 3+ n-gon uvs in pixels
        for (let uv_idx = 3; uv_idx < verts_in_face; uv_idx++) {
          const attr_select = 3 * uv_idx - 4; // Gives 5, 8, 11, etc. for uv_idx = 3, 4, 5 etc.
          const xy_idx = 2 * attr_select;
          const [uvx, uvy] = uv_face_data.subarray(xy_idx, xy_idx + 2);
          const uvx_px = s.w_px * uvx;
          const uvy_px = s.h_px * (1.0 - uvy);
          uv_px[uv_idx] = [uvx_px, uvy_px];
        }

        // Draw face polygons
        s.ctx.beginPath();
        s.ctx.moveTo(...uv_px[0]);
        for (let uv_i of uv_px.slice(1)) {
            s.ctx.lineTo(...uv_i);
        }
        s.ctx.closePath();
        s.ctx.stroke();

        return;
      };

      // Set drawing style
      const face_line_width = this._base_line_width / scale_factor;
      this.ctx.lineWidth = face_line_width;
      this.ctx.strokeStyle = this._color;

      // Run (non-blocking) loop!
      const num_faces = data_ref.counts.face;
      const [loop_ok, _, time_ms] = await this._loop_handler.run(num_faces, state, draw_one_face);
      this._log_render_time(cache_key, time_ms);

      // Save finished image to cache
      if (loop_ok) this._save_to_cache(cache_key);

      return;
    }

    // ...............................................................................................................

    _render_triangles = async(data_ref, scale_factor) => {

      // Render from cache if possible
      const cache_key = "triangles";
      const is_cached = this._render_from_cache(cache_key);
      if (is_cached) return;

      // Set up loop state data for drawing triangles
      const state = {
        ctx: this.ctx,
        w_px: this.w_px,
        h_px: this.h_px,
        uv_data: data_ref.uvs.vert,
        num_attrs_per_tri: 6
      }

      // Draw one polygon for each uv triplet (i.e. triangle!)
      const draw_one_triangle = (tri_idx, s) => {

        // Grab the uvs associated with each triangle
        const uv_idx = tri_idx * s.num_attrs_per_tri;
        const [x0,y0, x1,y1, x2,y2] = s.uv_data.subarray(uv_idx, uv_idx + s.num_attrs_per_tri);

        // Convert normalized uv coordinates to image (pixel) coords.
        const x0_px = s.w_px * x0;
        const x1_px = s.w_px * x1;
        const x2_px = s.w_px * x2;
        const y0_px = s.h_px * (1.0 - y0);
        const y1_px = s.h_px * (1.0 - y1);
        const y2_px = s.h_px * (1.0 - y2);

        // Draw triangle lines
        s.ctx.beginPath();
        s.ctx.moveTo(x0_px, y0_px);
        s.ctx.lineTo(x1_px, y1_px);
        s.ctx.lineTo(x2_px, y2_px);
        s.ctx.closePath();
        s.ctx.stroke();

        return;
      };

      // Set drawing style
      const tri_line_width = this._base_line_width / scale_factor;
      this.ctx.lineWidth = tri_line_width;
      this.ctx.strokeStyle = this._color;

      // Run (non-blocking) loop!
      const num_tris_to_render = Math.round(data_ref.counts.attr / 3);
      const [loop_ok, _, time_ms] = await this._loop_handler.run(num_tris_to_render, state, draw_one_triangle);
      this._log_render_time(cache_key, time_ms);

      // Save finished image to cache
      if (loop_ok) this._save_to_cache(cache_key);

      return;
    }

    // ...............................................................................................................

    _log_render_time = (cache_key, time_taken_ms) => {
      console.log(`${Math.round(time_taken_ms)} ms to render ${cache_key} wireframe`);
    }

    // ...............................................................................................................

  }


