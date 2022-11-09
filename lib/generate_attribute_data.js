

// ===================================================================================================================


class Computed_Vertex_Normals {

    /*
    Class used to manage the creation of vertex normals for model attribute data
    when normals are not directly provided in ply data set
    Normals are computed by averaging the normals of all faces connected to the vertex.

    Note that this calculation doesn't properly account for 'seams'
    i.e. cases where multiple unique vertices share the same xyz position,
    but are listed independently (for example, due to having different UV co-ords.)
    Properly accounting for these vertices requires detecting vertices which share the
    same xyz location, which is computationally demanding (?) and hasn't been implemented yet
    */

    // ...............................................................................................................

    constructor() {
        this.vertex_normals = null;
        this.attr_idx_to_vert_idx = null;
    }

    // ...............................................................................................................

    initialize = (vertex_count, attribute_count) => {
        
        // Initialize look-up that maps attributes to vertex indices
        this.attr_idx_to_vert_idx = new Array(attribute_count);

        // Initialize zeroed normals (we'll sum up all face normals and average them to get vertex normals)
        // -> But we need to start with zeros, so we can add the face normals!
        this.vertex_normals = new Array(vertex_count);
        for (let k = 0; k < this.vertex_normals.length; k++) {
            this.vertex_normals[k] = [0,0,0];
        }

        return;
    }

    // ...............................................................................................................

    accumulate_normals = (face_normal, vert_index, attr_index) => {

        /*
        For each vertex, we accumulate the normals of all connected faces.
        We need to normalize this accumulated result, after accounting for all vertices/faces
        */
        
        // Accumulate face normals
        this.vertex_normals[vert_index] = add_vectors(face_normal, this.vertex_normals[vert_index]);

        // Store mapping between each attribute & corresponding model vertex
        // -> We need this to be able to overwrite the normals attribute array data later
        this.attr_idx_to_vert_idx[attr_index] = vert_index;

        return;
    }

    // ...............................................................................................................

    update_attribute_normals(attribute_normals_array_ref) {

        /* Function used to update attribute array (vertex normals) data */

        // Normalize accumulated normals
        for (let k = 0; k < this.vertex_normals.length; k ++) {
            this.vertex_normals[k] = normalize_vector(this.vertex_normals[k]);
        }

        // Place generated vertex normals into attribute array
        let vidx, vec3_offset, new_vertex_normal;
        for (let aidx = 0; aidx < this.attr_idx_to_vert_idx.length; aidx++) {
            vidx = this.attr_idx_to_vert_idx[aidx];
            vec3_offset = 3 * aidx;
            new_vertex_normal = this.vertex_normals[vidx];
            attribute_normals_array_ref.set(new_vertex_normal, vec3_offset);
        }

        return;
    }

    // ...............................................................................................................
}


// ===================================================================================================================


class VertexCentricJSONAccess {

    /*
    Manages access to model json data. Provides standardized access to things like
    xyz object space vertex data, normals and uv coordinates.

    Vertex-centric formatting assumes that all data is stored on a per-vertex basis.
    -> This means (for example) that unique UV coordinates are encoded as unique vertices
    -> As a result, multiple 'duplicate' vertices may occupy the same physical position (xyz)
    For example:
        vertex v1: xyz = [1, 2, 3] and uv = [0.25, 0.75]
        vertex v2: xyz = [1, 2, 3] and uv = [0.75, 0.95]
    -> Even though both vertices represent the same point in space (same xyz value), they have different
       uv coordinates and are therefore encoded as separate vertices!
    */

    // ...............................................................................................................

    constructor(ply_model_json) {

        // Storage for model representation data
        this._vdata = null;
        this._face_indexing_lists = null;

        // Storage for checking for extra data sets
        this.has_vertex_normals = false;
        this.has_vertex_colors = false;
        this.has_uvs = false;
        this._u_key = null;
        this._v_key = null;

        // Calculate/record convenience variables
        this.xyz_deltas = null;
        this.xyz_mids = null;
        this.face_count = null;
        this.tri_count = null;
        this.vert_count = null;
        this._inspect(ply_model_json);
    }

    // ...............................................................................................................

    _inspect = (model_json) => {

        // For convenience
        const face_json = model_json.face;
        const vertex_json = model_json.vertex;
        
        // Storage for vertex data, the main data source for files with vertex-centric encoding (e.g. Blender)
        this._vdata = vertex_json.data;

        // Check if vertex-specific data are available
        this.has_vertex_normals = ["nx", "ny", "nz"].every(key => key in this._vdata);
        this.has_vertex_colors = ["red", "green", "blue"].every(key => key in this._vdata);

        // Check all face elements for a 'list' entry, which we'll assume is a vertex indices data set
        // -> Asssume there is only one!
        // -> The face_indexing_lists taken the form:
        //      [ [0, 1, 3, 7], [1, 3, 4], [14, 6, 18], [15, 18, 22, 11], etc... ]
        //  Where each 'sub-list' represents a single face to be rendered. The entries within
        //  the sub-lists (i.e. the numbers) are index values into other lists which hold things like
        //  the (x,y,z) or (u, v) values of a particular point. In this case, there is only 1 list and the
        //  indexing always refers to vertex data (which holds xyz, uv, normals, etc.)
        const face_list_data_key = find_element_list_key(face_json.info);
        this._face_indexing_lists = face_json.data[face_list_data_key];

        // Figure out if the vertex data contains uv keys & if so, record them
        // (Blender encodes uv using 's' and 't', so may as well account for it)
        const has_uv_keys = ["u", "v"].every(key => key in this._vdata);
        const has_st_keys = ["s", "t"].every(key => key in this._vdata);
        if (has_uv_keys) {
            this._u_key = "u";
            this._v_key = "v";
        } else if (has_st_keys) {
            this._u_key = "s";
            this._v_key = "t";
        } else {
            this._u_key = null;
            this._v_key = null;
        }
        this.has_uvs = (this._u_key != null) && (this._v_key != null);

        // Find object xyz mid-point + range, used for displaying/scaling vertex data
        const vinfo = vertex_json.info;
        this.xyz_deltas = [vinfo.x.delta, vinfo.y.delta, vinfo.z.delta];
        this.xyz_mids = [vinfo.x.mid, vinfo.y.mid, vinfo.z.mid];

        // Grab data counts
        this.face_count = face_json.count;
        this.tri_count = face_json.info[face_list_data_key].triangle_count;
        this.vert_count = vertex_json.count;

        return;
    }

    // ...............................................................................................................

    /*
    For vertex-centric data, there is a single indexing list that is shared for all data sets,
    with each unique xyz/uv/normal/color etc. being stored as it's own vertex
    */
    get_xyz_index_list = (face_index) => this._face_indexing_lists[face_index];
    get_uvs_indexing_list = this.get_xyz_index_list;//(face_index) => this.get_xyz_index_list(face_index);
    get_normals_index_list = this.get_xyz_index_list;//(face_index) => this.get_xyz_index_list(face_index);
    get_colors_index_list = this.get_xyz_index_list;//(face_index) => this.get_xyz_index_list(face_index);

    // ...............................................................................................................

    get_vertex_xyz = (idx) => [this._vdata.x[idx], this._vdata.y[idx], this._vdata.z[idx]];
    get_vertex_uv = (idx) => [this._vdata[this._u_key][idx], this._vdata[this._v_key][idx]];
    get_vertex_normal = (idx) => [this._vdata.nx[idx], this._vdata.ny[idx], this._vdata.nz[idx]];
    get_vertex_color = (idx) => [this._vdata.red[idx], this._vdata.green[idx], this._vdata.blue[idx]];

    // ...............................................................................................................

}


// ===================================================================================================================


class ArtecJSONAccess {

    /*
    Manages access to model json data, for files downloaded from the artec website
    This provides standardized access to things like xyz object space vertex data,
    normals and uv coordinates
    */

    // ...............................................................................................................

    constructor(ply_model_json) {
        
        // Storage for main representation of model from Artec
        this._xyz_data = null;
        this._face_xyz_indexing_lists = null;
        this._uv_data = null;
        this._face_uv_indexing_lists = null;

        // Storage for checking for extra data sets
        this.has_uvs = false;
        this.has_vertex_normals = false;
        this.has_vertex_colors = false;

        // Calculate/record convenience variables
        this.xyz_deltas = null;
        this.xyz_mids = null;
        this.face_count = null;
        this.tri_count = null;
        this.vert_count = null;
        this._inspect(ply_model_json);
    }

    // ...............................................................................................................

    _inspect = (model_json) => {
        
        // For convenience
        const face_json = model_json.face;
        const vertex_json = model_json.vertex;
        
        // Store object space data, which is guaranteed (?) to be available
        this._xyz_data = vertex_json.data;
        const face_xyz_list_key = find_element_list_key(face_json.info);
        this._face_xyz_indexing_lists = face_json.data[face_xyz_list_key];
        
        // Grab uv data & indexing only if available (not guaranteed)
        this.has_uvs = ["multi_texture_vertex", "multi_texture_face"].every(key => key in model_json);
        if (this.has_uvs) {
            this._uv_data = model_json.multi_texture_vertex.data;
            const face_uv_list_key = find_element_list_key(model_json.multi_texture_face.info);
            this._face_uv_indexing_lists = model_json.multi_texture_face.data[face_uv_list_key];
        }

        // Find object xyz mid-point + range, used for displaying/scaling vertex data
        const vinfo = vertex_json.info;
        this.xyz_deltas = [vinfo.x.delta, vinfo.y.delta, vinfo.z.delta];
        this.xyz_mids = [vinfo.x.mid, vinfo.y.mid, vinfo.z.mid];

        // Grab data counts
        this.face_count = face_json.count;
        this.tri_count = face_json.info[face_xyz_list_key].triangle_count;
        this.vert_count = vertex_json.count;

        return;
    }

    // ...............................................................................................................

    get_xyz_index_list = (face_index) => this._face_xyz_indexing_lists[face_index];
    get_uvs_indexing_list = (face_index) => this._face_uv_indexing_lists[face_index];
    get_normals_index_list = (face_index) => null;
    get_colors_index_list = (face_index) => null;

    // ...............................................................................................................

    get_vertex_xyz = (idx) => [this._xyz_data.x[idx], this._xyz_data.y[idx], this._xyz_data.z[idx]];
    get_vertex_uv = (idx) => [this._uv_data.u[idx], this._uv_data.v[idx]];
    get_vertex_normal = (idx) => null;
    get_vertex_color = (idx) => null;

    // ...............................................................................................................
}


// ===================================================================================================================


class Model_Attribute_Parser {

    // ...............................................................................................................

    constructor(progress_bar_ref, max_loop_duration_ms = 80) {

        // Store inputs
        this._progress_bar = progress_bar_ref;
        this._max_loop_duration_ms = max_loop_duration_ms;

        // Storage for temporary data, which is used while parsing
        this._loop_data = null;
        this._attr_idx = 0;
        this._computed_vnormals = null;

        // Storage for mapping ui keys to data keys
        this._ui_to_data_lut = {};
        
        // Storage for convenience data
        this.counts = null;
        this.bounds = null;
        this.has = null;
        this.per_attr_size = null;
        
        // Storage for attribute array data (i.e. the 'main' data of this object!)
        this.xyzs = null;
        this.normals = null;
        this.uvs = null;
        this.colors = null;
        this.placeholder = null;
        this.tris_per_face = null;

        // Indicator variable, true when data has been fully parsed!
        this.available = false;
    }

    // ...............................................................................................................

    reset = () => {

        // Wipe out convenience data
        this.counts = null;
        this.bounds = null;
        this.has = null;
        this.per_attr_size = null;

        // Wipe out main data sets
        this.xyzs = null;
        this.normals = null;
        this.uvs = null;
        this.colors = null;
        this.placeholder = null;
        this.tris_per_face = null;

        // Tag data as being unavailable, now that we wiped out everything!
        this.available = false;

        return;
    }

    // ...............................................................................................................

    json_to_attributes = async(header_json, model_json) => {

        // Gather data into appropriate format, before processing
        this._loop_data = this._choose_data_representation(header_json, model_json);
        this._attr_idx = 0;
        this._setup_storage();

        // Set up loop handler, so that we don't freeze up the ui while working
        const loop_handler = new Nonblocking_ForLoop(this._max_loop_duration_ms);
        loop_handler.set_progress_callback(this._progress_bar.update);

        // Run data parsing loop!
        this._progress_bar.set_title("Generating render data");
        const [loop_ok, _, time_ms] = await loop_handler.run(this.counts.face, this, this._iter_func);
        console.log(`${Math.round(time_ms)} ms to generate attribute data`);

        // Finish up parsing, as long as the loop finished
        if (loop_ok) {
            
            // Calculate & store the per-vertex normals if they weren't in original data set
            if (!this.has.vnormals) this._computed_vnormals.update_attribute_normals(this.normals.vert);
    
            // Clear storage for garbage collection
            this._loop_data = null;
            this._attr_idx = null;
            this._computed_vnormals = null;
            
            // Indicate data available
            this.available = true;
        }

        return loop_ok;
    }

    // ...............................................................................................................

    set_ui_to_data_mapping = (ui_keys_to_data_keys_lut) => this._ui_to_data_lut = ui_keys_to_data_keys_lut;
    get_data = (color_select, shade_select) => {
        
        // Warn about bad color selections
        const has_color_key = (color_select in this._ui_to_data_lut);
        if (!has_color_key) {
            const valid_keys = Object.keys(this._ui_to_data_lut);
            console.log(`Bad color select! Got: ${color_select}`,
            "\nValid options:\n", valid_keys);
            color_select = valid_keys[0];
        }

        // Warn about bad shading selections
        const has_shade_key = (shade_select in this._ui_to_data_lut);
        if(!has_shade_key) {
            const valid_keys = Object.keys(this._ui_to_data_lut);
            console.log(`Bad shade select! Got: ${shade_select}`,
            "\nValid options:\n", valid_keys);
            shade_select = valid_keys[0];
        }

        const color_data_key = this._ui_to_data_lut[color_select];
        const shade_data_key = this._ui_to_data_lut[shade_select];

        return this[color_data_key][shade_data_key];
    }

    // ...............................................................................................................

    _setup_storage = () => {

        // For convenience. We want to know how much data we'll need to store, in advance
        this.counts = {
            face: this._loop_data.face_count,
            tri: this._loop_data.tri_count,
            vert: this._loop_data.vert_count,
            attr: 3 * this._loop_data.tri_count
        };

        this.bounds = {
            xyz_deltas: this._loop_data.xyz_deltas,
            xyz_mids: this._loop_data.xyz_mids
        }

        // Indicators for which data is present (that we'll need to parse!)
        this.has = {
            uvs: this._loop_data.has_uvs,
            vnormals: this._loop_data.has_vertex_normals,
            vcolors: this._loop_data.has_vertex_colors
        };

        // Helper for sizing typed buffers (i.e. Float32Array), per attribute
        this.per_attr_size = {
            vec3: 3 * this.counts.attr,
            vec2: 2 * this.counts.attr,
            empty: 0
        }

        // Initialize storage for data we know we can store
        this.tris_per_face = new Uint8Array(this.counts.face);
        this.xyzs = this._make_empty_containers(this.per_attr_size.vec3);
        this.normals = this._make_empty_containers(this.per_attr_size.vec3);

        // Only allocate storage for uv data if there actually is uv data!
        const uv_attr_size = this.has.uvs ? this.per_attr_size.vec2 : this.per_attr_size.empty;
        this.uvs = this._make_empty_containers(uv_attr_size);

        // Only allocate storage for color data if there actually is color data!
        const color_attr_size = this.has.vcolors ? this.per_attr_size.vec3 : this.per_attr_size.empty;
        this.colors = this._make_empty_containers(color_attr_size);

        // If we need to generate vertex normals, then allocate storage for calculating these as well
        if (!this.has.vnormals) {
            this._computed_vnormals = new Computed_Vertex_Normals();
            this._computed_vnormals.initialize(this.counts.vert, this.counts.attr);
        }

        // Create an empty/placeholder variable, so we can pass in blank data to shader if needed
        const placeholder_array = new Float32Array(this.counts.attr);
        this.placeholder = {
            vert: placeholder_array,
            tri: placeholder_array,
            face: placeholder_array
        }

        // Fill in dummy uv data if needed
        if (!this.has.uvs) {
            this.uvs.vert = placeholder_array;
            this.uvs.tri = placeholder_array;
            this.uvs.face = placeholder_array;
        }

        // Fill in dummy color data if needed
        if (!this.has.vcolors) {
            this.colors.vert = placeholder_array;
            this.colors.tri = placeholder_array;
            this.colors.face = placeholder_array;
        }

        return this;
    }

    // ...............................................................................................................

    _iter_func = (face_idx, s) => {

        // For convenience
        const has_uvs = s.has.uvs;
        const has_vnormals = s.has.vnormals;
        const has_vcolors = s.has.vcolors;
        const data = s._loop_data;

        let face_uv_idx_list, face_normal_idx_list, face_color_idx_list;
        let tri_uv_idx_list, tri_normal_idx_list, tri_color_idx_list;
        let face_xyz, face_normal, face_uv, face_color;
        let tri_xyz, tri_normal, tri_uv, tri_color;
        let vert_xyz, vert_normal, vert_uv, vert_color;
        
        // Get face indexing lists
        const face_xyz_idx_list = data.get_xyz_index_list(face_idx);
        if (has_uvs) face_uv_idx_list = data.get_uvs_indexing_list(face_idx);
        if (has_vnormals) face_normal_idx_list = data.get_normals_index_list(face_idx);
        if (has_vcolors) face_color_idx_list = data.get_colors_index_list(face_idx);
        
        // Skip points/edges if they're given in face data (not sure if this would ever happen...?)
        const num_face_verts = face_xyz_idx_list.length;
        if (num_face_verts < 3) {
            console.error(
                `Got face with ${num_face_verts} vertices!`,
                "\nCan only handle faces with 3 or more vertices");
            return;
        }

        // Count the number of triangles in each face (for drawing triangulated UVs later)
        const num_tris = num_face_verts - 2;
        s.tris_per_face[face_idx] = num_tris;

        // Calculate quantities for entire face (may be different than triangle/vertex-specific data)
        face_xyz = get_central_xyz(face_xyz_idx_list, data);
        face_normal = get_face_normal(face_xyz_idx_list, data);
        if (has_uvs) face_uv = get_central_uv(face_uv_idx_list, data);
        if (has_vcolors) face_color = get_central_color(face_color_idx_list, data);

        // Now loop over all triangles within a given face, to get triangle-specific data
        for (let rel_tri_idx = 0; rel_tri_idx < num_tris; rel_tri_idx++) {

            // Get triangle indexing lists
            const tri_xyz_idx_list = get_face_to_triangle_indexing(face_xyz_idx_list, rel_tri_idx);
            if (has_uvs) tri_uv_idx_list = get_face_to_triangle_indexing(face_uv_idx_list, rel_tri_idx);
            if (has_vnormals) tri_normal_idx_list = get_face_to_triangle_indexing(face_normal_idx_list, rel_tri_idx);
            if (has_vcolors) tri_color_idx_list = get_face_to_triangle_indexing(face_color_idx_list, rel_tri_idx);

            // Calculate quantities for each triangle
            tri_xyz = get_central_xyz(tri_xyz_idx_list, data);
            tri_normal = get_triangle_normal(tri_xyz_idx_list, data);
            if (has_uvs) tri_uv = get_central_uv(tri_uv_idx_list, data);
            if (has_vcolors) tri_color = get_central_color(tri_color_idx_list, data);
            
            // Now loop over vertices of each triangle to get vertex-specific data
            for (let rel_vert_idx = 0; rel_vert_idx < 3; rel_vert_idx++) {

                // Get data indexing for vertices
                const vert_xyz_idx = tri_xyz_idx_list[rel_vert_idx];
                
                // Calculate array offsets for 3D data & 2D attribute data
                const vec3_offset = 3 * s._attr_idx;
                const vec2_offset = 2 * s._attr_idx;
                
                // Store object space data
                vert_xyz = data.get_vertex_xyz(vert_xyz_idx);
                s.xyzs.vert.set(vert_xyz, vec3_offset);
                s.xyzs.tri.set(tri_xyz, vec3_offset);
                s.xyzs.face.set(face_xyz, vec3_offset);
                
                // Store normals data
                s.normals.tri.set(tri_normal, vec3_offset);
                s.normals.face.set(face_normal, vec3_offset);
                
                // Record vertex normals or generate them, as needed
                if (has_vnormals) {
                    const vert_normal_idx = tri_normal_idx_list[rel_vert_idx];
                    vert_normal = data.get_vertex_normal(vert_normal_idx);
                    s.normals.vert.set(vert_normal, vec3_offset);
                } else {
                    s._computed_vnormals.accumulate_normals(face_normal, vert_xyz_idx, s._attr_idx);
                }
                
                // Store uv data if possible
                if (has_uvs) {
                    const vert_uv_idx = tri_uv_idx_list[rel_vert_idx];
                    vert_uv = data.get_vertex_uv(vert_uv_idx);
                    s.uvs.vert.set(vert_uv, vec2_offset);
                    s.uvs.tri.set(tri_uv, vec2_offset);
                    s.uvs.face.set(face_uv, vec2_offset);
                }

                // Store color data if possible
                if (has_vcolors) {
                    const vert_color_idx = tri_color_idx_list[rel_vert_idx];
                    vert_color = data.get_vertex_color(vert_color_idx);
                    s.colors.vert.set(vert_color, vec3_offset);
                    s.colors.tri.set(tri_color, vec3_offset);
                    s.colors.face.set(face_color, vec3_offset);
                }

                // Keep track of which attribute we're indexing, for next loop
                s._attr_idx += 1;
            }
        }

        return;
    }

    // ...............................................................................................................

    _make_empty_containers = (size) => {
        return {
            vert: new Float32Array(size),
            tri: new Float32Array(size),
            face: new Float32Array(size)
        };
    }

    // ...............................................................................................................

    _choose_data_representation = (header_json, model_json) => {

        /*
        Function used to select the appropriate data representation
        i.e. how to interpret geometry/uvs from the model json data
        */

        // Check if the data uses the artec encoding
        let is_artec_data = false;
        for (let line of header_json.comments) {
            if (line.toLowerCase().includes("artec")) {
                is_artec_data = true;
                break;
            }
        }

        // We'll assume data is encoded in vertex-centric way if not artec!
        // (haven't seen enough examples to know the full range of representations)
        const data_rep = is_artec_data ? new ArtecJSONAccess(model_json) : new VertexCentricJSONAccess(model_json);

        return data_rep;
    }

    // ...............................................................................................................
}


// -------------------------------------------------------------------------------------------------------------------
//// Functions

// ...................................................................................................................

function get_face_to_triangle_indexing(index_list, relative_triangle_index) {

    /*
    Helper function used to extract triangle indexing from an n-gon index list (for n >= 3).
    Assumes n-gon is represented in 'triangle-strip' order.
    Note that for an n-gon, the relative triangle index must be >= 0 and <= (n-3)

    Given a list of n indices [a,b,c,d,....], triangle strip ordering always takes the first
    index ('a' in this case) and then a consequtive pair of indices to form 3 points of a triangle.
    The pair of indices is offset starting from the second index ('b' in this case), based on the
    relative triangle index, which goes from 0 to (n-3). For a triangle index of 0, we get the pair [b,c],
    so the triangle would be formed from [a,b,c]. For triangl index 1, we get [c,d] giving the triangle
    [a,c,d] and so on. The diagram below shows the indexing pattern

           [a, b, c, d, e, f, g, ....]
    (tri 0) *  *  *                     (a, b, c)
    (tri 1) *     *  *                  (a, c, d)
    (tri 2) *        *  *               (a, d, e)
    (tri 3) *           *  *            (a, e, f)
    (tri 4) *              *  *         (a, f, g)
            etc.
    */

    return [
        index_list[0],
        index_list[1 + relative_triangle_index],
        index_list[2 + relative_triangle_index]
    ];
}

// ...................................................................................................................


// -------------------------------------------------------------------------------------------------------------------
//// Central values

// ...................................................................................................................

function get_central_xyz(vertex_idx_list, data_access_ref) {

    /* Calculate the central object space coordinate for a given set of vertices (e.g. a face/triangle) */

    // Find the average object space coords. from all vertices
    let x_sum = 0;
    let y_sum = 0;
    let z_sum = 0;
    for (let vidx of vertex_idx_list) {
        const [x, y, z] = data_access_ref.get_vertex_xyz(vidx)
        x_sum += x;
        y_sum += y;
        z_sum += z;
    }
    const num_verts = vertex_idx_list.length;
    const cen_objspace = [x_sum / num_verts, y_sum / num_verts, z_sum / num_verts];

    return cen_objspace;
}

// ...................................................................................................................

function get_central_uv(vertex_idx_list, data_access_ref) {

    /* Calculate the central UV coordinate for a given set of vertices (e.g. a face/triangle) */

    // Find the average UV coords. from all vertices
    let u_sum = 0;
    let v_sum = 0;
    for (let vidx of vertex_idx_list) {
        const [u, v] = data_access_ref.get_vertex_uv(vidx);
        u_sum += u;
        v_sum += v;
    }
    const num_verts = vertex_idx_list.length;
    const cen_uv = [u_sum / num_verts, v_sum / num_verts];

    return cen_uv;
}

// ...................................................................................................................

function get_central_color(vertex_idx_list, data_access_ref) {

    /* Calculate the average vertex color for a given set of vertices (e.g. a face/triangle) */

    // Find the average color from all vertices
    let r_sum = 0;
    let g_sum = 0;
    let b_sum = 0;
    for (let vidx of vertex_idx_list) {
        const [r, g, b] = data_access_ref.get_vertex_color(vidx)
        r_sum += r;
        g_sum += g;
        b_sum += b;
    }
    const num_verts = vertex_idx_list.length;
    const avg_color = [r_sum / num_verts, g_sum / num_verts, b_sum / num_verts];

    return avg_color;
}


// -------------------------------------------------------------------------------------------------------------------
//// Normals

// ...................................................................................................................

function get_face_normal(vertex_idx_list, data_access_ref) {

    // For clarity
    const num_verts = vertex_idx_list.length;
    const is_tri = (num_verts === 3);
    const is_quad = (num_verts === 4);

    // Calculate face normal
    let face_normal;
    if (is_tri) {
        face_normal = get_triangle_normal(vertex_idx_list, data_access_ref);
    } else if (is_quad) {
        face_normal = get_quad_normal(vertex_idx_list, data_access_ref);
    } else {
        face_normal = get_ngon_normal(vertex_idx_list, data_access_ref);
    }

    return face_normal;
}

// ...................................................................................................................

function get_triangle_normal(vert_idxs, data_access_ref) {

    // Grab coords for the points making up the triangle
    const [idx1, idx2, idx3] = vert_idxs;
    const [x1,y1,z1] = data_access_ref.get_vertex_xyz(idx1);
    const [x2,y2,z2] = data_access_ref.get_vertex_xyz(idx2);
    const [x3,y3,z3] = data_access_ref.get_vertex_xyz(idx3);

    // Calculate the normal using 2 edges of the triangle
    const vec_1_2 = [x2 - x1, y2 - y1, z2 - z1];
    const vec_1_3 = [x3 - x1, y3 - y1, z3 - z1];
    const face_normal = cross_product(vec_1_2, vec_1_3);

    return normalize_vector(face_normal);
}

// ...................................................................................................................

function get_quad_normal(vert_idxs, data_access_ref) {

    // Grab coords for the points making up the quad
    const [idx1, idx2, idx3, idx4] = vert_idxs;
    const [x1,y1,z1] = data_access_ref.get_vertex_xyz(idx1);
    const [x2,y2,z2] = data_access_ref.get_vertex_xyz(idx2);
    const [x3,y3,z3] = data_access_ref.get_vertex_xyz(idx3);
    const [x4,y4,z4] = data_access_ref.get_vertex_xyz(idx4);

    // Calculate the normal using the diagonals of the quad
    const vec_1_3 = [x3 - x1, y3 - y1, z3 - z1];
    const vec_2_4 = [x4 - x2, y4 - y2, z4 - z2];
    const face_normal = cross_product(vec_1_3, vec_2_4);

    return normalize_vector(face_normal);
}

// ...................................................................................................................

function get_ngon_normal(vert_idxs, data_access_ref) {

    /*
    Calculates a normal vector for an arbitrary n-gon
    Uses 'Newell's method', see:
    https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal#Newell.27s_Method
    */

    let out_x = 0;
    let out_y = 0;
    let out_z = 0;

    let next_idx;
    for (let k = 0; k < vert_idxs.length; k++) {
        curr_idx = vert_idxs[k];
        next_idx = vert_idxs[(k + 1) % vert_idxs.length];
        const [curr_x, curr_y, curr_z] = data_access_ref.get_vertex_xyz(curr_idx);
        const [next_x, next_y, next_z] = data_access_ref.get_vertex_xyz(next_idx);

        out_x += (curr_y - next_y) * (curr_z + next_z);
        out_y += (curr_z - next_z) * (curr_x + next_x);
        out_z += (curr_x - next_x) * (curr_y + next_y);
    }

    // Normalize result
    const out_length = Math.sqrt(out_x * out_x + out_y * out_y + out_z * out_z);
    return [out_x / out_length, out_y / out_length, out_z / out_length];
}

// ...................................................................................................................

function find_element_list_key(model_element_info) {

    /*
    Helper used to find the first element name (object key) in a given element info object
    whose element is a list type (usually a listing of indices which make up some face data)
    Returns null if no key is found!
    */

    let list_data_key = null;

    for (let [data_key, data_info] of Object.entries(model_element_info)) {
        if (data_info.is_list) { 
            list_data_key = data_key;
            break;
        }
    }

    return list_data_key;
}

// ...................................................................................................................
