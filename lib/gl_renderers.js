

class GLRender {

    // ...............................................................................................................

    constructor(canvas_elem) {

        // Get access to context for webgl calls
        this.canvas = canvas_elem;
        this.gl = canvas_elem.getContext("webgl2", {antialias: true});
        if (this.gl === null) { 
            alert("Error setting up WebGL2! Cannot render graphics");
            return;
        }
        this._prev_render_px = 0;

        // Allocate space for holding compiled programs and associated vertex array data
        this._program_cache = {};
        this.program = null;
        this.vao = null;
        
        // Store geometry sizing info
        this._num_attrs = null;

        // For clarity
        this._type_for_render = this.gl.TRIANGLES;
        this._offset_for_render = 0;
        
        // Allocate storage for data passed into the shaders
        this.attributes = {};
        this.uniforms = {};
        this.textures2d = {};

        // Variables used to handle rendering updates more efficiently
        this._anim_id = null;
    }

    // ...............................................................................................................
    
    enable_3d = () => {

        // Avoid drawing geometry that is behind front-facing geometry
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE);
    }

    // ...............................................................................................................

    reset = () => {

        // Stop any in-progress rendering
        cancelAnimationFrame(this._anim_id);

        // Clear uniform buffers
        for (let entry of Object.values(this.uniforms)) {
            entry.teardown();
        }
        this.uniforms = {};

        // Clear texture buffers
        for (let entry of Object.values(this.textures2d)) {
            entry.teardown();
        }
        this.textures2d = {};

        // Clear attribute buffers & re-bind small data, to flush gpu
        const data_buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, data_buffer);
        for (let entry of Object.values(this.attributes)) {
            entry.teardown();
            this.gl.bufferData(this.gl.ARRAY_BUFFER, 0, this.gl.STATIC_DRAW);
        }
        this.attributes = {};
        this._num_attrs = null;

        // Delete vertex array object
        if (this.vao != null) {
            this.gl.deleteVertexArray(this.vao);
            this.vao = null;
        }

        return;
    }

    // ...............................................................................................................

    select_program = (color_select, shader_gen_func) => {

        // If we don't already have the selected program/vao, make it!
        const already_compiled = (color_select in this._program_cache);
        if (!already_compiled) {
            const [vert_source, frag_source] = shader_gen_func(color_select);
            const new_program = _compile_shaders(this.gl, vert_source, frag_source);
            this._program_cache[color_select] = new_program;
        }
        
        // Update current program and create a vao if needed
        this.program = this._program_cache[color_select];
        if (this.vao === null) this.vao = this.gl.createVertexArray();

        return;
    }

    // ...............................................................................................................

    clear_vao = () => this.gl.bindVertexArray(null);

    // ...............................................................................................................

    render = () => {

        if (this._anim_id != null) cancelAnimationFrame(this._anim_id);
        this._anim_id = requestAnimationFrame(this._render_on_frame_request);

        return;
    }

    // ...............................................................................................................

    _render_on_frame_request = (timestamp) => {

        // Check the current canvas sizing, to see if we need to adjust rendering resolution
        const min_px = Math.min(this.canvas.clientWidth, this.canvas.clientHeight);
        const render_px = Math.max(1, Math.floor(min_px / 50)) * 50;
        
        //  Update render resolution if needed
        // (note, this is separate from display resolution, set by CSS!)
        const need_resize = (render_px != this._prev_render_px);
        if (need_resize) {
            this.canvas.width  = render_px;
            this.canvas.height = render_px;
            this.gl.viewport(0, 0, render_px, render_px);
        }

        // Tell it to use our program (pair of shaders) & vertex data
        this.gl.useProgram(this.program);
        this.gl.bindVertexArray(this.vao);
        this.gl.drawArrays(this._type_for_render, this._offset_for_render, this._num_attrs);

        return;
    }

    // ...............................................................................................................

    set_attribute_count = (attr_count) => this._num_attrs = attr_count;

    // ...............................................................................................................

    set_attribute_f32_data = (attribute_name, float32_array, components_per_iter = null) => {

        // Clear existing data
        const existing_attr = Object.keys(this.attributes).includes(attribute_name);
        if (existing_attr) {
            this.attributes[attribute_name].teardown();
            this.attributes[attribute_name] = null;
        }

        // // Make sure we associate data together
        this.gl.useProgram(this.program);
        this.gl.bindVertexArray(this.vao);
        
        // Create new buffer, and push data into it
        const data_buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, data_buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, float32_array, this.gl.STATIC_DRAW);
        
        // Figure out how many array entries per vertex, if not provided
        if (components_per_iter === null) {
            components_per_iter = float32_array.length / this._num_attrs;
        }
        
        // Specify how to read the attribute data from the array
        // -> This also associates data in the ARRAY_BUFFER with the attribute (by attr location)
        // -> After this call, attribute data is stored in the created buffer
        // -> ARRAY_BUFFER can be bound to something else
        // See: https://webgl2fundamentals.org/webgl/lessons/resources/webgl-state-diagram.html
        const attr_location = this.gl.getAttribLocation(this.program, attribute_name);
        const attr_ok = (attr_location >= 0);
        if (attr_ok) {
            const type = this.gl.FLOAT;
            const normalize = false;
            const stride = 0;
            const offset = 0;
            this.gl.vertexAttribPointer(attr_location, components_per_iter, type, normalize, stride, offset);
            this.gl.enableVertexAttribArray(attr_location);
        } else {
            console.warn(`Invalid/unused attribute name: ${attribute_name}`);
        }

        // Store attribute for future reference/updating
        this.attributes[attribute_name] = {
            "location": attr_location, "buffer": data_buffer, "size": components_per_iter,
            "teardown": () => this.gl.deleteBuffer(data_buffer)
        };

        // Detach vao, in case something else starts binding data
        this.clear_vao();

        return;
    }

    // ...............................................................................................................

    set_uniform_float1d = (uniform_name, float_value) => {

        // Make sure we associate data together
        this.gl.useProgram(this.program);
        this.gl.bindVertexArray(this.vao);

        // Set up a helper function for moving data to the gpu & move provided data
        const uni_location = this.gl.getUniformLocation(this.program, uniform_name);
        const loader = (data) => this.gl.uniform1f(uni_location, data);
        loader(float_value);

        // Store uniform for future reference/updating
        const float_type = `uniform1f`;
        this.uniforms[uniform_name] = {
            "location": uni_location,
            "type": float_type,
            "loader": loader,
            "teardown": () => null
        };

        // Detach vao, in case something else starts binding data
        this.clear_vao();

        return;
    }

    // ...............................................................................................................

    set_uniform_float3d = (uniform_name, vec3_float) => {

        // Make sure we associate data together
        this.gl.useProgram(this.program);
        this.gl.bindVertexArray(this.vao);

        // Set up a helper function for moving data to the gpu & move provided data
        const uni_location = this.gl.getUniformLocation(this.program, uniform_name);
        const loader = (data) => {

            // Make sure data is an array of length 3!
            let vec_data = data;
            if (!Array.isArray(data)) vec_data = new Array(3).fill(data);
            if (vec_data.length < 3) vec_data = vec_data.concat(new Array(3 - vec_data.length).fill(0));
            if (vec_data.length > 3) vec_data = vec3_data.slice(0, 3);
            this.gl.uniform3fv(uni_location, vec_data);
        }
        loader(vec3_float);

        // Store uniform for future reference/updating
        const float_type = `uniform3fv`;
        this.uniforms[uniform_name] = {
            "location": uni_location,
            "type": float_type,
            "loader": loader,
            "teardown": () => null
        };

        // Detach vao, in case something else starts binding data
        this.clear_vao();

        return;
    }

    // ...............................................................................................................

    set_uniform_mat4 = (uniform_name, matrix_data) => {

        // Make sure we associate data together
        this.gl.useProgram(this.program);
        this.gl.bindVertexArray(this.vao);

        // Convert data to 1D
        const first_data_item = matrix_data[0];
        const is_2d_matrix = Array.isArray(first_data_item);
        const matrix_1d = is_2d_matrix ? matrix_data.flat() : matrix_data;
        
        // Check sizing
        const bad_mat_size = (matrix_1d.length != 16);
        if (bad_mat_size) {
            console.error("Bad matrix sizing!",
            "\nExpecting 16 element matrix (4x4)",
            `Got: ${matrix_1d.length}`);
            console.log("Matrix Data:", matrix_data);
            return;
        }

        // Set up a helper function for moving data to the gpu & move provided data
        const uni_location = this.gl.getUniformLocation(this.program, uniform_name);
        const is_transposed = false;
        const loader = (data) => this.gl.uniformMatrix4fv(uni_location, is_transposed, data);
        loader(matrix_1d);

        // Store uniform for future reference/updating
        const matrix_type = `matrix4fv`;
        this.uniforms[uniform_name] = {
            "location": uni_location,
            "type": matrix_type,
            "loader": loader,
            "teardown": () => null
        };

        // Detach vao, in case something else starts binding data
        this.clear_vao();

        return;
    }

    // ...............................................................................................................

    set_texture_2d = (uniform_name, image_data) => {

        // Check if we have an existing texture entry or need to set up a new one
        const existing_texture = (uniform_name in this.textures2d);
        let texture_unit, texture_buffer;
        if (existing_texture) {

            // Grab existing texture unit & buffer, so we don't keep re-instantiating them
            texture_unit = this.textures2d[uniform_name].unit;
            texture_buffer = this.textures2d[uniform_name].buffer;

        } else {

            // Get new (unused) texture unit & buffer
            texture_unit = Object.keys(this.textures2d).length;
            texture_buffer = this.gl.createTexture();

            // Tell the shader which texture unit we're using for the sampler
            const uni_location = this.gl.getUniformLocation(this.program, uniform_name);
            this.gl.uniform1i(uni_location, texture_unit);

            // Store texture for future reference/updating
            this.textures2d[uniform_name] = {
                "location": uni_location,
                "buffer": texture_buffer,
                "image": image_data,
                "unit": texture_unit,
                "teardown": () => this.gl.deleteTexture(texture_buffer)
            };
        }
        
        // Bind to the correct texture buffer
        const target = this.gl.TEXTURE_2D;
        this.gl.activeTexture(this.gl.TEXTURE0 + texture_unit);
        this.gl.bindTexture(target, texture_buffer);

        // Set up appropriate edge-wrapping behavior if we haven't already done so
        if (!existing_texture) {
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        }

        // For clarity
        const miplevel = 0;
        const internal_format = this.gl.RGBA;
        const format = this.gl.RGBA;
        const type = this.gl.UNSIGNED_BYTE;

        // Load image data
        this.gl.texImage2D(target, miplevel, internal_format, format, type, image_data);
        this.gl.generateMipmap(target);

        return;
    }

    // ...............................................................................................................

    update_uniform = (uniform_name, new_data) => {

        // Make sure uniform exists!
        const existing_uni = Object.keys(this.uniforms).includes(uniform_name);
        if (!existing_uni) {
            console.error(`Undefined uniform: (${uniform_name})`,
                "\nCannot update value!");
            return false;
        }

        // Make sure we associate data together
        this.gl.useProgram(this.program);
        this.gl.bindVertexArray(this.vao);

        this.uniforms[uniform_name].loader(new_data);

        // Detach vao, in case something else starts binding data
        this.clear_vao();

        return true;
    }

    // ...............................................................................................................

}



class UVRenderer {

    // ...............................................................................................................

    constructor(canvas_elem_id) {
        this.canvas_elem = document.getElementById(canvas_elem_id);
        this.gl_render = new GLRender(this.canvas_elem);
    }

    // ...............................................................................................................

    render = () => this.gl_render.render();
    reset = () => this.gl_render.reset();

    // ...............................................................................................................

    set_attributes = (color_select, shade_select, attribute_data) => {

        this.gl_render.set_attribute_count(attribute_data.counts.attr);
        this.gl_render.select_program(color_select, this._make_shaders);

        // Set up geometry/color data
        this.gl_render.set_attribute_f32_data("a_point_uv", attribute_data.get_data("uv", "vertices"));
        this.gl_render.set_attribute_f32_data("a_color", attribute_data.get_data(color_select, shade_select));

        return;
    }

    // ...............................................................................................................

    set_color_scaling = (color_scale, color_offset) => {

        this.gl_render.set_uniform_float1d("u_color_scale", color_scale);
        this.gl_render.set_uniform_float3d("u_color_offset", color_offset);

        return;
    }

    // ...............................................................................................................

    _make_shaders = (color_select) => {

        const v_uniforms = ["vec3 u_color_offset", "float u_color_scale"];
        const v_attributes = ["vec2 a_point_uv", "vec3 a_color"];
        const v_varyings = ["vec3 v_color"];

        const vert_shader_source = `#version 300 es

        // Uniforms
        ${_write_vars("uniform", v_uniforms)}

        // Vertex attributes
        ${_write_vars("in", v_attributes)}

        // Varyings
        ${_write_vars("out", v_varyings)}

        void main() {

            // Pass color information with scaling on to fragment shader
            v_color = (a_color * u_color_scale) + u_color_offset;
        
            // Output UV positioning to draw triangles for each UV region
            gl_Position = (vec4(a_point_uv, 0, 1.0) * 2.0) - 1.0;
        }
        `;

        // .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . .

        // Set up lookup table for choosing how fragment color is calculated
        const color_calc_lut = {
            "matcap": "v_color",
            "uv": "vec3(v_color.rg, 0)",
            "colors": "v_color",
            "object_space": "v_color",
            "normals": "v_color",
            "missing": "vec3(1, 0, 1)"
        };
        const has_key = (color_select in color_calc_lut);
        const color_calc = has_key ? color_calc_lut[color_select] : color_calc_lut["missing"];

        const frag_shader_source = `#version 300 es

        precision lowp float;
        
        // Uniform
        ${_write_vars("uniform", [])}
        
        // Varyings
        ${_write_vars("in", v_varyings)}
        
        // Output fragment color
        out vec4 frag_color;
        
        void main() {
            vec3 col = ${color_calc};
            frag_color = vec4(col, 1.0);
        }
        `;

        return [vert_shader_source, frag_shader_source];
    }

    // ...............................................................................................................
}


class OrbitRenderer {

    // ...............................................................................................................

    constructor(canvas_elem_id) {

        this.canvas_elem = document.getElementById(canvas_elem_id);
        this.gl_render = new GLRender(this.canvas_elem);
        this.gl_render.enable_3d();

        this.matcap_texture = new Matcap_Render(256);

        this.orbit_cam = new Orbit_Camera(30);
        this.orbit_cam.bind_to_canvas(this.canvas_elem, this.render);
        this._is_ortho = false;
    }

    // ...............................................................................................................

    enable_ui = () => this.orbit_cam.enable_ui();
    disable_ui = () => this.orbit_cam.disable_ui();
    set_orthographic = (is_orthographic) => this._is_ortho = is_orthographic;
    set_camera_orientation = (camera_orientation) => this.orbit_cam.set_world_orientation(camera_orientation);
    set_model_bounds = (max_xyz_delta, xyz_mids) => this.orbit_cam.set_bounds(max_xyz_delta, xyz_mids);
    reset = () => this.gl_render.reset();

    // ...............................................................................................................

    render = () => {

        // Get camera-based space mapping matrices
        const view_matrix = this.orbit_cam.get_world_to_view_matrix4();
        const clipspace_matrix = this.orbit_cam.get_view_to_clipspace_matrix4(this._is_ortho);

        // Update matrix data
        this.gl_render.update_uniform("u_obj_to_viewspace", view_matrix.matrix_1d);
        this.gl_render.update_uniform("u_view_to_clipspace", clipspace_matrix.matrix_1d);

        // Render 3D geometry!
        this.gl_render.render();

        return;
    }

    // ...............................................................................................................

    set_attributes = (color_select, shade_select, attribute_data) => {

        this.gl_render.set_attribute_count(attribute_data.counts.attr);
        this.gl_render.select_program(color_select, this._make_shaders);

        // Set required render geometry/coloring data
        this.gl_render.set_attribute_f32_data("a_point_ospace", attribute_data.get_data("object_space", "vertices"));
        this.gl_render.set_attribute_f32_data("a_normal", attribute_data.get_data("normals", shade_select));
        this.gl_render.set_attribute_f32_data("a_color", attribute_data.get_data(color_select, shade_select));

        // Setup projection matrix uniforms
        const eye_matrix = new Matrix4();
        this.gl_render.set_uniform_mat4("u_obj_to_viewspace", eye_matrix.matrix_1d);
        this.gl_render.set_uniform_mat4("u_view_to_clipspace", eye_matrix.matrix_1d);

        // Set up texturing data for matcap rendering
        this.gl_render.set_texture_2d("u_matcap_texture", this.matcap_texture.image_data);

        return;
    }

    // ...............................................................................................................

    set_color_scaling = (color_scale, color_offset) => {

        this.gl_render.set_uniform_float1d("u_color_scale", color_scale);
        this.gl_render.set_uniform_float3d("u_color_offset", color_offset);

        return;
    }

    // ...............................................................................................................

    _make_shaders = (color_select) => {

        const _matrix_uniforms = ["mat4 u_obj_to_viewspace", "mat4 u_view_to_clipspace"];
        const _color_uniforms = ["vec3 u_color_offset", "float u_color_scale"];
        const v_uniforms = [..._matrix_uniforms, ..._color_uniforms];
        const v_attributes = ["vec4 a_point_ospace", "vec3 a_normal", "vec3 a_color"];
        const v_varyings = ["vec3 v_color", "vec2 v_matcap"];

        const vert_shader_source = `#version 300 es

        // Uniforms
        ${_write_vars("uniform", v_uniforms)}

        // Vertex attributes
        ${_write_vars("in", v_attributes)}

        // Varyings
        ${_write_vars("out", v_varyings)}

        void main() {

            // Pass color information with scaling on to fragment shader
            v_color = (a_color * u_color_scale) + u_color_offset;

            // Get view-space normals for sampling matcap texture
            v_matcap = normalize((u_obj_to_viewspace * vec4(a_normal, 0.0))).xy;
            v_matcap = (1.0 + v_matcap * vec2(1.0, -1.0)) * 0.5;
        
            // Output UV positioning to draw triangles for each UV region
            gl_Position = u_view_to_clipspace * u_obj_to_viewspace * a_point_ospace;
        }
        `;

        // .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . .

        const f_uniforms = ["sampler2D u_matcap_texture"];

        // Set up lookup table for choosing how fragment color is calculated
        const color_calc_lut = {
            "matcap": "texture(u_matcap_texture, v_matcap).rgb",
            "colors": "v_color",
            "uv": "vec3(v_color.rg, 0)",
            "object_space": "v_color",
            "normals": "v_color",
            "missing": "vec3(1, 0, 1)"
        };
        const has_key = (color_select in color_calc_lut);
        const color_calc = has_key ? color_calc_lut[color_select] : color_calc_lut["missing"];

        const frag_shader_source = `#version 300 es

        precision lowp float;
        
        // Uniform
        ${_write_vars("uniform", f_uniforms)}
        
        // Varyings
        ${_write_vars("in", v_varyings)}
        
        // Output fragment color
        out vec4 frag_color;
        
        void main() {
            vec3 col = ${color_calc};
            frag_color = vec4(col, 1.0);
        }
        `;

        return [vert_shader_source, frag_shader_source];
    }

    // ...............................................................................................................
}


// -------------------------------------------------------------------------------------------------------------------
// Functions

// ...................................................................................................................

function _create_shader(gl_ref, type, source) {
    const shader = gl_ref.createShader(type);
    gl_ref.shaderSource(shader, source);
    gl_ref.compileShader(shader);
    const success = gl_ref.getShaderParameter(shader, gl_ref.COMPILE_STATUS);
    if (success) return shader;

    console.log("Error creating shader:", gl_ref.getShaderInfoLog(shader));
    gl_ref.deleteShader(shader);
}

// ...................................................................................................................

function _create_program(gl_ref, vertexShader, fragmentShader) {
    const program = gl_ref.createProgram();
    gl_ref.attachShader(program, vertexShader);
    gl_ref.attachShader(program, fragmentShader);
    gl_ref.linkProgram(program);
    const success = gl_ref.getProgramParameter(program, gl_ref.LINK_STATUS);
    if (success) return program;

    console.log("Error creating program:", gl_ref.getProgramInfoLog(program));
    gl_ref.deleteProgram(program);
}

// ...................................................................................................................

function _compile_shaders(gl_ref, vert_source, frag_source) {

    const v_shader = _create_shader(gl_ref, gl_ref.VERTEX_SHADER, vert_source);
    const f_shader = _create_shader(gl_ref, gl_ref.FRAGMENT_SHADER, frag_source);
    const program = _create_program(gl_ref, v_shader, f_shader);

    return program;
}

// ...................................................................................................................

function _write_vars(var_keyword, var_names_list) {

    /*
    Helper function, used to generate the variable declarations
    at the top of vertex/fragment shader code. Can be used for
    defining uniforms, vertex attributes as well as varyings
    by changing the var_keyword (e.g. "uniform", "in" or "out").
    Note that the var_names_list should include the varaible type
    as well (e.g. mat4 vs. vec3 vs. sampler2d etc.)

    For example, given inputs:
        var_keyword = "uniform"
        var_names_list = ["mat4 data", "sampler2d texture", "mat3 other"]

    Returns the string:
        uniform mat4 data;
        uniform sampler2d texture;
        uniform mat3 other;
    
    If an empty name list is given, this function will just return "// nothing"
    */

    const no_names_provided = (var_names_list.length === 0 || var_names_list === null);
    if (no_names_provided) { 
        return "// nothing";
    }

    const bad_names_list = (var_names_list === undefined);
    if (bad_names_list) {
        console.error("Error writing shader variables!",
        `\nNo variables names provided for keyword: ${var_keyword}`);
    }

    return var_names_list.map(var_name => `${var_keyword} ${var_name};`).join("\n");
}

// ...................................................................................................................