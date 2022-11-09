
class Orbit_Canvas {

    /*
    Class used to handle updating of a html canvas element
    Based on an Orbit_Camera instance. Any time the camera is changed,
    a canvas rendering function is called
    */
    
    // ...............................................................................................................

    constructor(canvas_ref, orbit_camera_ref, render_func) {

        // Make sure the canvas_ref is a DOM element
        if (typeof(canvas_ref) === "string") canvas_ref = document.getElementById(canvas_ref);

        // Store inputs for re-use
        this.canvas = canvas_ref;
        this.orbit = orbit_camera_ref;
        this.render_func = render_func;

        // Attach event listeners
        this._enabled = true;
        this.is_active = false;
        canvas_ref.addEventListener("pointerdown", this._on_click);
        canvas_ref.addEventListener("pointerup", this._on_finish)
        canvas_ref.addEventListener("pointercancel", this._on_finish);
        canvas_ref.addEventListener("pointermove", this._on_orbit);
        canvas_ref.addEventListener("wheel", this._on_zoom, {passive: false});
    }

    // ...............................................................................................................

    enable_ui = () => this._enabled = true;
    disable_ui = () => this._enabled = false;

    // ...............................................................................................................

    _on_click = (event) => {

        // Prevent interaction when disabled
        if (!this._enabled) return;

        // Record canvas as pointer target
        // -> Dragging off canvas doesn't cause lose of focus
        // -> Need to manually release the capture when pointer is released
        const pt_id = event.pointerId;
        this.canvas.setPointerCapture(pt_id);
        this.is_active = true;

        return;
    }

    // ...............................................................................................................

    _on_finish = (event) => {

        const pt_id = event.pointerId;
        this.canvas.releasePointerCapture(pt_id);
        this.is_active = false;

        return;
    }

    // ...............................................................................................................
    
    _on_orbit = (event) => {

        // Prevent interaction when disabled
        if (!this._enabled) return;

        // Ignore movement unless we're dragging
        if (!this.is_active) return;
        
        // Get mouse movement
        const delta_x = 1000 * event.movementX / screen.width;
        const delta_y = 1000 * event.movementY / screen.width;
        const moved = this.orbit.move_camera(delta_x, delta_y);
        if (moved) this.render_func();

        return;
    }

    // ...............................................................................................................

    _on_zoom = (event) => {

        // Avoid scrolling the page!
        event.preventDefault();

        // Prevent interaction when disabled
        if (!this._enabled) return;

        const delta = event.wheelDeltaY;
        const zoomed = this.orbit.zoom_camera(delta);
        if (zoomed) this.render_func();

        return;
    }

    // ...............................................................................................................

}


// ===================================================================================================================


class Orbit_Camera {

    /*
    Class which models a 3D camera orbiting a world origin. Intended to be used
    along with a WebGL canvas to render 3D points/shapes in space.
    Can be attached to an html canvas using a Orbit_Canvas object.
    The most important function are:
        get_world_to_view_matrix4 & get_view_to_clipspace_matrix4
    
    These return the 4x4 matrices needed to map 3D points (expressed in 4D homogeneous coords.)
    into 2D points on-screen (i.e. in clipspace), assuming points are viewed
    by a camera which orbits the world origin.
    */

    // ...............................................................................................................
    
    constructor(fov_degrees) {

        // Store inputs
        this.fov_deg = fov_degrees;

        // For clarity
        this._default_distance = 5;
        this._max_distance = 20;
        this._min_distance = 2;

        // Storage for camera positioning
        this.x_origin = 0;
        this.y_origin = 0;
        this.z_origin = 0;
        
        // Allocate terms for camera orientation and world axes (which affect orbiting orientation)
        this._world_orientation = null;
        this.cam = {up: [0, 0, 1], right: [1, 0, 0], position_norm: [0, -1, 0], distance: this._default_distance};
        this.world = {up: [0, 0, 1], right: [1, 0, 0]};
        this.set_world_orientation("zx");

        // Storage for attached canvas
        this._canvas = null;
    }

    // ...............................................................................................................

    enable_ui = () => this._canvas.enable_ui();
    disable_ui = () => this._canvas.disable_ui();

    // ...............................................................................................................

    bind_to_canvas = (orbit_canvas, render_func) => this._canvas = new Orbit_Canvas(orbit_canvas, this, render_func);

    // ...............................................................................................................

    reset = () => {
        this.cam.distance = this._default_distance;
        this._update_world_axes(this.world.up, this.world.right);
    }

    // ...............................................................................................................

    set_bounds = (max_xyz_delta, xyz_mids) => {

        // Update camera distancing to have the object zoomed in nicely
        this._default_distance = 2.5 * max_xyz_delta;
        this._min_distance = 0.5 * max_xyz_delta;
        this._max_distance = 20 * max_xyz_delta;

        // Have camera point at the center of the object
        this.x_origin = xyz_mids[0];
        this.y_origin = xyz_mids[1];
        this.z_origin = xyz_mids[2];

        this.reset();
    }

    // ...............................................................................................................

    set_world_orientation = (up_right_string) => {

        // Don't do anything if the orientation is the same!
        const ori_changed = (up_right_string != this._world_orientation);
        if (ori_changed) {
            
            // Get new world up setting (assuming string in format: "xy" or "zx" etc.)
            const up_str = up_right_string.charAt(0);
            const right_str = up_right_string.charAt(1);
            
            // Set up the world up/right vectors according to up/right strings
            const idx_lut = {x: 0, y: 1, z: 2};
            let world_up = [0,0,0];
            let world_right = [0,0,0];
            world_up[idx_lut[up_str]] = 1;
            world_right[idx_lut[right_str]] = 1;
    
            // Update the camera according to the new world up direction
            this._update_world_axes(world_up, world_right);
        }

        // Store new orientation for future checks
        this._world_orientation = up_right_string;

        return ori_changed;
    }

    // ...............................................................................................................

    get_world_to_view_matrix4 = () => {

        /* Returns a matrix that maps positions in world space to view space (i.e. in front of camera) */

        // Map unit camera position to some distance away from the origin (but along the same direction)
        const camera_world_position = this.cam.position_norm.map(entry => this.cam.distance * entry);
        
        // Find camera 'world' matrix assuming it looks at the origin and invert to get 'view matrix'
        const camera_world_matrix = Matrix4.look_at_origin(camera_world_position, this.cam.up);
        camera_world_matrix.translate(this.x_origin, this.y_origin, this.z_origin);
        const view_matrix = camera_world_matrix.get_inverse();

        return view_matrix;
    }

    // ...............................................................................................................

    get_view_to_clipspace_matrix4 = (is_ortho = false) => {
        
        /* Gives a matrix that maps view-space coords to clipspace (-1, +1) coords */

        const clipspace_matrix = new Matrix4();
        if (is_ortho) {
            clipspace_matrix.orthographic(this.fov_deg, this.cam.distance);
        } else {
            clipspace_matrix.projection(this.fov_deg, this._min_distance * 0.25, this._max_distance * 2);
        }

        return clipspace_matrix;
    }

    // ...............................................................................................................

    move_camera = (mouse_delta_x, mouse_delta_y, sensitivity = 0.005) => {

        if (mouse_delta_x === 0 && mouse_delta_y === 0) return false;
        
        // Determine amount/direction to rotate
        const axis_mag = Math.sqrt(mouse_delta_x * mouse_delta_x + mouse_delta_y * mouse_delta_y);
        const rot_angle_rad = axis_mag * sensitivity;
        const rot_axis_vector = this._get_rotation_vector(mouse_delta_x, mouse_delta_y);

        // Rotate old camera position to new position and update camera axes
        this.cam.position_norm = Orbit_Camera.rotate_axis_angle(this.cam.position_norm, rot_axis_vector, rot_angle_rad);
        this._update_camera_axes();

        return true;
    }

    // ...............................................................................................................

    zoom_camera = (zoom_delta, sensitivity = 0.95) => {

        if (zoom_delta === 0) return false;

        // Move camera closer/further but with limits, we're not monsters!
        const is_zoom_out = Math.sign(zoom_delta) > 0;
        this.cam.distance *= is_zoom_out ? sensitivity : (1.0 / sensitivity);
        this.cam.distance = Math.max(this.cam.distance, this._min_distance);
        this.cam.distance = Math.min(this.cam.distance, this._max_distance);

        return true;
    }

    // ...............................................................................................................

    _update_camera_axes = () => {

        /* Function used to update camera axes based on modified camera positioning */

        // Get camera z-axis, assuming it points to the origin
        const origin = [0, 0, 0];
        const z_axis = normalize_vector(subtract_vectors(this.cam.position_norm, origin));

        const target_vertical = this.world.up.map(entry => 1.0 - entry);

        // Find new x/y axis, with constraint that x-axis is perpendicular to the world up
        let x_axis = normalize_vector(cross_product(this.cam.up, z_axis));
        x_axis = normalize_vector(multiply_vectors(x_axis, target_vertical));
        const y_axis = normalize_vector(cross_product(z_axis, x_axis));

        // Update stored vectors
        this.cam.right = x_axis;
        this.cam.up = y_axis;

        return;
    }

    // ...............................................................................................................

    _update_world_axes(world_up_vec3, world_right_vec3) {

        // Update world axes directly
        this.world.up = world_up_vec3;
        this.world.right = world_right_vec3;
        
        // Align camera to new world axes, to avoid weird intermediate states
        this.cam.up = world_up_vec3;
        this.cam.right = world_right_vec3;
        
        // Update camera position to indicate change in world axis
        const world_forward = cross_product(world_up_vec3, world_right_vec3);
        this.cam.position_norm = world_forward.map(entry => -1 * entry);

        return;
    }

    // ...............................................................................................................

    _get_rotation_vector(delta_x, delta_y) {

        /*
        Function used to figure out which way the 'rotation axis' is pointing,
        given a mouse movement xy delta. Takes current camera orientation into account!
        */

        const num_dim = 3;
        const rot_axis_scaled = new Array(num_dim);
        for (let k = 0; k < num_dim; k++) {
            rot_axis_scaled[k] = -1 * ((this.cam.right[k] * delta_y) + (this.cam.up[k] * delta_x));
        }

        return normalize_vector(rot_axis_scaled);
    }

    // ...............................................................................................................

    static rotate_axis_angle(point, rot_axis_vector, rot_axis_angle_rad) {

        /*
        Rotate a point with an axis-angle vector (i.e. rotation axis + amount/angle to rotate)
        Uses Rodrigues' rotation formula:
        https://en.wikipedia.org/wiki/Rodrigues%27_rotation_formula#Statement
        */

        // Pre-calculate some quantities for convenience
        const cos = Math.cos(rot_axis_angle_rad);
        const sin = Math.sin(rot_axis_angle_rad);
        const a_cross_p = cross_product(rot_axis_vector, point);
        const a_dot_p = dot_product(rot_axis_vector, point);
        const scaled_a_dot_p = (1.0 - cos) * a_dot_p;

        // Calculate new point position using axis-angle rotation
        let pt_term, cross_term, axis_term;
        const rotated_point = new Array(3);
        for (let k = 0; k < point.length; k++) {
            pt_term = cos * point[k];
            cross_term = sin * a_cross_p[k];
            axis_term = scaled_a_dot_p * rot_axis_vector[k];
            rotated_point[k] = pt_term + cross_term + axis_term;
        }

        return normalize_vector(rotated_point);
    }

    // ...............................................................................................................
}
