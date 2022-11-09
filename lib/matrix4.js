

class Matrix4 {

    // ...............................................................................................................

    constructor(initial_matrix_1d = null) {
        this.matrix_1d = initial_matrix_1d;
        if (initial_matrix_1d === null) {
            this.matrix_1d = [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1
            ];
        }
    }

    // ...............................................................................................................

    translate(dx, dy, dz) {

        const trans_mat = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            dx, dy, dz, 1,
        ];

        this.matrix_1d = this.multiply(trans_mat);

        return this;
    }

    // ...............................................................................................................

    rotate_x(angle_rad) {

        const cos_term = Math.cos(angle_rad);
        const sin_term = Math.sin(angle_rad);

        const rot_mat = [
            1, 0, 0, 0,
            0, cos_term, sin_term, 0,
            0, -sin_term, cos_term, 0,
            0, 0, 0, 1,
        ];

        this.matrix_1d = this.multiply(rot_mat);

        return this;
    }

    // ...............................................................................................................

    rotate_y(angle_rad) {

        const cos_term = Math.cos(angle_rad);
        const sin_term = Math.sin(angle_rad);

        const rot_mat = [
            cos_term, 0, -sin_term, 0,
            0, 1, 0, 0,
            sin_term, 0, cos_term, 0,
            0, 0, 0, 1,
        ];

        this.matrix_1d = this.multiply(rot_mat);

        return this;
    }

    // ...............................................................................................................

    rotate_z(angle_rad) {

        const cos_term = Math.cos(angle_rad);
        const sin_term = Math.sin(angle_rad);

        const rot_mat = [
            cos_term, sin_term, 0, 0,
            -sin_term, cos_term, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        ];

        this.matrix_1d = this.multiply(rot_mat);

        return this;
    }

    // ...............................................................................................................

    scale(sx, sy, sz) {

        const scale_mat = [
            sx, 0, 0, 0,
            0, sy, 0, 0,
            0, 0, sz, 0,
            0, 0, 0, 1
        ];

        this.matrix_1d = this.multiply(scale_mat);

        return this;
    }

    // ...............................................................................................................

    projection(field_of_view_deg, near = 0.1, far = 100, aspect_ratio = 1.0) {

        const fov_rads = field_of_view_deg * Math.PI / 180.0;
        const f = Math.tan(0.5 * (Math.PI - fov_rads));
        const range_inv = 1.0 / (near - far);
    
        const projection_mat = [
            f / aspect_ratio, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (near + far) * range_inv, -1,
            0, 0, near * far * range_inv * 2, 0
        ];

        this.matrix_1d = this.multiply(projection_mat);

        return this;    
    }

    // ...............................................................................................................

    orthographic(fov_deg, distance, far = 50, near = 0.1) {

        /*
        See: https://www.scratchapixel.com/
        Calculate the orthographic projection matrix. Scaling is calculated in order
        to best match the scale of objects from the same perspective projection,
        with a given camera distance (from the origin).

        Scaling is calculated so that the orthographic projection has the same 'x'
        side length as the perspective projection. This is found from the triangle:
                 
                _x_
               |  /
            d  | /
               |/
            angle = FOV/2

        From here, given camera distance 'd' and field of view (FOV), the
        'x' side length will be:
          x = d * tan(FOV/2)
        
        Scaling the orthographic projection by 1/x gives object sizing consistent
        with perspective projection, regardless of FOV
        */

        // Calculate scaling/zoom factor needed to match perspective sizing
        const half_fov_rad = (fov_deg / 2) * (Math.PI / 180);
        const perspective_side_length = distance * Math.tan(half_fov_rad);
        const zoom = 1 / perspective_side_length;

        // Define orthographic viewing volume boundaries
        const right = 1;
        const left = -1;
        const top = 1;
        const bottom = -1;

        // For convenience
        const x_plus = right + left;
        const x_minus = right - left;
        const y_plus = top + bottom;
        const y_minus = top - bottom;
        const z_plus = far + near;
        const z_minus = far - near;

        let ortho_mat = [
            zoom * 2/x_minus, 0, 0, 0,
            0, zoom * 2/y_minus, 0, 0,
            0, 0, -zoom * 2/z_minus, 0,
            -x_plus/x_minus, -y_plus/y_minus, -z_plus/z_minus, 1
        ];

        this.matrix_1d = this.multiply(ortho_mat);

        return this;
    }

    // ...............................................................................................................

    static look_at_origin(camera_position, up_direction) {

        const origin = [0, 0, 0];
        const cam_z_axis = normalize_vector(subtract_vectors(camera_position, origin));
        const cam_x_axis = normalize_vector(cross_product(up_direction, cam_z_axis));
        const cam_y_axis = normalize_vector(cross_product(cam_z_axis, cam_x_axis));

        const look_mat = [
            cam_x_axis[0], cam_x_axis[1], cam_x_axis[2], 0,
            cam_y_axis[0], cam_y_axis[1], cam_y_axis[2], 0,
            cam_z_axis[0], cam_z_axis[1], cam_z_axis[2], 0,
            camera_position[0], camera_position[1], camera_position[2], 1,
        ];

        return new Matrix4(look_mat);
    }
    
    // ...............................................................................................................

    multiply(other_mat4, post_multiply = false) {

        /*
        Helper, multiplies this.matrix_1d * other_matrix, as a 4x4 matrix multiply
        Returns another 4x4 matrix, in 1d (row-major) format
        */

        // Make sure we're using 1d array data (if not, assume a Matrix4 was passed in and grab it's data)
        const other_1d = Array.isArray(other_mat4) ? other_mat4 : other_mat4.matrix_1d;

        // Handle multiplication order
        const mat_a = post_multiply ? other_1d : this.matrix_1d;
        const mat_b = post_multiply ? this.matrix_1d : other_1d;

        let out_row, out_col, a_idx, b_idx, dot_sum;
        const new_mat = new Array(16).fill();
        for (let out_idx = 0; out_idx < new_mat.length; out_idx++) {

            // Figure out which 'row' and 'column' of the output we're calculating
            out_row = Math.floor(out_idx / 4);  // 0 0 0 0 1 1 1 1 2 2 2 2 3 3 3 3
            out_col = out_idx % 4;              // 0 1 2 3 0 1 2 3 0 1 2 3 0 1 2 3

            // Dot product between rows of 'a' (this) and columns of 'b' (other)
            dot_sum = 0;
            for (let k = 0; k < 4; k ++) {
                a_idx = (out_row * 4) + k;
                b_idx = out_col + (k * 4);
                dot_sum += this.matrix_1d[a_idx] * other_1d[b_idx];
            }
            new_mat[out_idx] = dot_sum;
        }
        
        return new_mat;
    }

    // ...............................................................................................................

    multiply_vector(vector_3d, post_multiply = true) {

        /* Multiply: matrix4 * vector */

        // For convenience
        const [r0, r1, r2, r3] = this.get_2d(post_multiply);
        const w_value = 1
        const vector_xyzw = [...vector_3d, w_value];

        // Handle matrix-vector multiplication
        const new_x = dot_product(r0, vector_xyzw);
        const new_y = dot_product(r1, vector_xyzw);
        const new_z = dot_product(r2, vector_xyzw);
        const new_w = dot_product(r3, vector_xyzw);

        const out_vec = [new_x / new_w, new_y / new_w, new_z / new_w];

        return out_vec;
    }

    // ...............................................................................................................

    transpose() {

        /* Performs in-place transpose */

        this.matrix_1d = this._new_transpose(this.matrix_1d);

        return this;
    }

    // ...............................................................................................................

    get_transpose() {

        /* Performs matrix transpose, but returns a new 1D matrix, instead of overwriting existing matrix */

        const trans_mat = new Array(this.matrix_1d.length);
        let trans_idx, orig_idx;
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                trans_idx = col + 4 * row;
                orig_idx = row + 4 * col;
                trans_mat[trans_idx] = this.matrix_1d[orig_idx];
            }
        }

        return trans_mat;
    }

    // ...............................................................................................................

    get_inverse() {

        /*
        Finds matrix inverse using the 'adjugate matrix'
        Based on:
        https://www.geometrictools.com/Documentation/LaplaceExpansionTheorem.pdf
        
        For more detail explanation, see:
        https://semath.info/src/inverse-cofactor-ex4.html
        */

        // For convenience
        const [a00, a01, a02, a03,
               a10, a11, a12, a13,
               a20, a21, a22, a23,
               a30, a31, a32, a33] = this.matrix_1d;

        // Calculate submatrix determinants for Laplace expansion theorem calculations
        const s0 = (a00 * a11) - (a10 * a01);
        const s1 = (a00 * a12) - (a10 * a02);
        const s2 = (a00 * a13) - (a10 * a03);
        const s3 = (a01 * a12) - (a11 * a02);
        const s4 = (a01 * a13) - (a11 * a03);
        const s5 = (a02 * a13) - (a12 * a03);
        const c5 = (a22 * a33) - (a32 * a23);
        const c4 = (a21 * a33) - (a31 * a23);
        const c3 = (a21 * a32) - (a31 * a22);
        const c2 = (a20 * a33) - (a30 * a23);
        const c1 = (a20 * a32) - (a30 * a22);
        const c0 = (a20 * a31) - (a30 * a21);

        // Calculate 4x4 determinant (and confirm we can invert!)
        const determinant = (s0*c5) - (s1*c4) + (s2*c3) + (s3*c2) - (s4*c1) + (s5*c0);
        const not_invertible = (determinant === 0);
        if (not_invertible) {
            const err_msg = "Cannot invert matrix!";
            alert(err_msg);
            console.error(err_msg);
            this.print();
            return null;
        }
        
        // Calculate adjugate matrix (using Laplace expansion theorem)
        const adj_r0 = [
            a11*c5 - a12*c4 + a13*c3, -a01*c5 + a02*c4 - a03*c3,
            a31*s5 - a32*s4 + a33*s3, -a21*s5 + a22*s4 - a23*s3
        ];
        const adj_r1 = [
            -a10*c5 + a12*c2 - a13*c1, a00*c5 - a02*c2 + a03*c1,
            -a30*s5 + a32*s2 - a33*s1, a20*s5 - a22*s2 + a23*s1
        ];
        const adj_r2 = [
            a10*c4 - a11*c2 + a13*c0, -a00*c4 + a01*c2 - a03*c0,
            a30*s4 - a31*s2 + a33*s0, -a20*s4 + a21*s2 - a23*s0,
        ];
        const adj_r3 = [
            -a10*c3 + a11*c1 - a12*c0, a00*c3 - a01*c1 + a02*c0,
            -a30*s3 + a31*s1 - a32*s0, a20*s3 - a21*s1 + a22*s0
        ];
        const adjugate_mat = [adj_r0, adj_r1, adj_r2, adj_r3];
        
        // Calculate: 1/det(A) * adj(A) to get inverse of A, in 1D format
        const one_over_det = 1 / determinant;
        const matrix_inverse_1d = new Array(16);
        let idx_1d;
        for (let row = 0; row < 4; row++) {
            const adj_row = adjugate_mat[row];
            for (let col = 0; col < 4; col ++) {
                idx_1d = col + row * 4;
                matrix_inverse_1d[idx_1d] = adj_row[col] * one_over_det;
            }
        }

        return new Matrix4(matrix_inverse_1d);
    }

    // ...............................................................................................................

    print(matrix_1d = null) {

        let mat = matrix_1d;
        if (matrix_1d === null) mat = this.matrix_1d;

        let row_strs = [];
        for (let k = 0; k < 4; k++) {
            const start_idx = 4 * k;
            const nice_strs = mat.slice(start_idx, start_idx + 4).map(item => Number(item).toPrecision(2));
            row_strs.push(nice_strs.join(", "));
        }

        console.log(row_strs.join("\n"));

        return;
    }

    // ...............................................................................................................

    get_2d(transpose = false) {

        /* Returns the '2D' representation of a 1D matrix (represented as a list of rows) */

        let mat = transpose ? this.get_transpose() : this.matrix_1d;

        const r0 = mat.slice(0, 4);
        const r1 = mat.slice(4, 8);
        const r2 = mat.slice(8, 12);
        const r3 = mat.slice(12);

        return [r0, r1, r2, r3];
    }

    // ...............................................................................................................
}



// -------------------------------------------------------------------------------------------------------------------
// Vector functions

// ...................................................................................................................

function get_vector_magnitude(vec3) {
    const [x, y, z] = vec3;
    return Math.sqrt(x*x + y*y + z*z);
}

// ...................................................................................................................

function normalize_vector(vec3) {

    // Avoid divide-by-zero errors
    const vec_mag = get_vector_magnitude(vec3)
    const is_zero_vector = (vec_mag < 0.0000001);
    if (is_zero_vector) {
        console.warn("Divide by zero error! Cannot normalize vector!");
        return vec3;
    }
    
    // Normalize each entry of the vector
    return vec3.map(entry => entry / vec_mag);
}

// ...................................................................................................................

function dot_product(vec3_a, vec3_b) {

    // Warning for mismatched vectors
    if (vec3_a.length != vec3_b.length) {
        console.warn("Performing dot product between vectors of different lengths!", "\n",
        "Will use smaller length for calculation!", "\n", vec3_a, vec3_b);
    }
    
    const vec_length = Math.min(vec3_a.length, vec3_b.length);
    let out_val = 0
    for(let k = 0; k < vec_length; k++) {
        out_val += vec3_a[k] * vec3_b[k];
    }

    return out_val;
}

// ...................................................................................................................

function cross_product(vec3_a, vec3_b) {

    /* Assumes 3D vectors! */

    // For clarity
    const [ax, ay, az] = vec3_a;
    const [bx, by, bz] = vec3_b;

    const result = [
        ay * bz - az * by,
        az * bx - ax * bz,
        ax * by - ay * bx
    ];

    return result;
}

// ...................................................................................................................

function add_vectors(vec3_a, vec3_b) {
    return _elementwise_op(vec3_a, vec3_b, (a,b) => a + b);
}

// ...................................................................................................................

function subtract_vectors(vec3_a, vec3_b) {
    return _elementwise_op(vec3_a, vec3_b, (a,b) => a - b);
}

// ...................................................................................................................

function multiply_vectors(vec3_a, vec3_b) {
    return _elementwise_op(vec3_a, vec3_b, (a,b) => a * b);
}

// ...................................................................................................................

function scale_vector(scalar, vec3) {
    return vec3.map(entry => scalar * entry);
}

// ...................................................................................................................

function add_to_vector(offset, vec3) {
    return vec3.map(entry => offset + entry);
}

// ...................................................................................................................

function _elementwise_op(vec3_a, vec3_b, operation_callback) {

    const vec_length = Math.min(vec3_a.length, vec3_b.length);
    let out_vec = new Array(vec_length);
    for(let k = 0; k < vec_length; k++) {
        out_vec[k] = operation_callback(vec3_a[k], vec3_b[k]);
    }

    return out_vec;
}

// ...................................................................................................................
