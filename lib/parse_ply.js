
class Property_Value_Stats {

    constructor() {
        this.min_value = Number.POSITIVE_INFINITY;
        this.max_value = Number.NEGATIVE_INFINITY;
    }

    update = (new_value) => {
        this.min_value = Math.min(this.min_value, new_value);
        this.max_value = Math.max(this.max_value, new_value);
    }

    write_output = (output_to_write_to) => {

        // For clarity
        const mid_value = (this.max_value + this.min_value) / 2.0;
        const delta_value = (this.max_value - this.min_value);

        // Store value range
        output_to_write_to.min = this.min_value;
        output_to_write_to.max = this.max_value;

        // Store bounding info
        output_to_write_to.mid = mid_value;
        output_to_write_to.delta = delta_value;

        return;
    }

}


// ===================================================================================================================


class Property_List_Stats {

    constructor() {

        // Default min/max values so that they will be overwritten by first value seen
        this.min_value = Number.POSITIVE_INFINITY;
        this.max_value = Number.NEGATIVE_INFINITY;

        // Default min/max list lengths so they will be overwritten
        this.min_length = Number.MAX_SAFE_INTEGER;
        this.max_length = -1;

        // Keep track of a triangle counter. Assuming list data represents vertex indices of faces
        this.triangle_count = 0;
    }

    update = (new_list_data) => {

        const new_min_value = Math.min(...new_list_data);
        const new_max_value = Math.max(...new_list_data);
        const new_length = new_list_data.length;

        // Store min/max value from list
        this.min_value = Math.min(this.min_value, new_min_value);
        this.max_value = Math.max(this.max_value, new_max_value);

        // Update min/max list length
        this.min_length = Math.min(this.min_length, new_length);
        this.max_length = Math.max(this.max_length, new_length);

        // Total update a 'triangle count' assuming list data represent vertices of faces
        // A face with 3 verts counts as 1 triangle, 4 verts is 2 tris etc. hence: (length - 2)
        this.triangle_count += new_length - 2;

        return;
    }

    write_output = (output_to_write_to) => {

        // For clarity
        const mid_value = (this.max_value + this.min_value) / 2.0;
        const delta_value = (this.max_value - this.min_value);

        // Store value range
        output_to_write_to.min = this.min_value;
        output_to_write_to.max = this.max_value;

        // Store bounding info
        output_to_write_to.mid = mid_value;
        output_to_write_to.delta = delta_value;

        // Store list-specific data
        output_to_write_to.min_length = this.min_length;
        output_to_write_to.max_length = this.max_length;
        output_to_write_to.triangle_count = this.triangle_count;

        return;
    }
}


// ===================================================================================================================


class Ascii_Element_Row_Parser {

    // ...............................................................................................................

    constructor(element_properties_list) {

        this._info = {};
        this._property_readers = [];

        // Storage for progress callback
        this._after_progress = () => null;

        for(let line of element_properties_list) {

            // Parse property string to figure out how to read data from file
            const property = parse_property_string(line);
            const reader_func = property.is_list ? this._get_list_data_reader() : this._get_single_data_reader();

            // Store parsing info/functionality
            this._property_readers.push({name: property.name, read: reader_func});
            this._info[property.name] = {
                type: property.data_type,
                is_list: property.is_list,
                min: null,
                max: null,
                mid: null,
                delta: null
            };
        }
    }

    // ...............................................................................................................

    set_progress_callback = (callback) => this._after_progress = callback;

    // ...............................................................................................................

    parse = async(data_strs_list, line_offset, row_count) => {

        /*
        Data parsing for ascii-format files. Built to be similar to the
        binary parsing implementation, for ease-of-copy-pasta!
        */

        // Initialize empty arrays to hold parsed data for each property (e.g. x, y, z, etc.)
        const elem_data = {};
        const stats = {};
        for (const [name, property_info] of Object.entries(this._info)) {
            if (property_info.is_list) {
                stats[name] = new Property_List_Stats();
                elem_data[name] = new Array(row_count);
            } else {
                stats[name] = new Property_Value_Stats();
                elem_data[name] = make_new_data_array(property_info.type, row_count)
            }
        }

        // Set up state data for loop
        const state = {
            data_strs_list, line_offset, elem_data, stats,
            total_bytelength: 0,
            property_readers: this._property_readers,
            info: this._info
        };

        const iter_func = (elem_row, s) => {

            // Grab string data for the current row and separate all entries (space-delimited)
            const row_idx = elem_row + s.line_offset;
            const strings_per_line = s.data_strs_list[row_idx].split(" ");
            const numbers_per_line = strings_per_line.map(entry => Number(entry));

            // Read each property from each line
            let col_idx = 0;
            for (let reader of s.property_readers) {

                // Read each property entry
                const [new_data, col_count] = reader.read(numbers_per_line, col_idx);
                col_idx += col_count;

                // Store data & statistics
                const name = reader.name;
                s.elem_data[name][elem_row] = new_data;
                s.stats[name].update(new_data);
            }

            return;
        };

        // Parse data in a non-blocking way
        const loop_handler = new Nonblocking_ForLoop(50);
        loop_handler.set_progress_callback(this._after_progress);
        const [_, time_taken_ms] = await loop_handler.run(row_count, state, iter_func);
            
        // Record stats values for each of the properties
        for (const [name, stats_data] of Object.entries(stats)) {
            stats_data.write_output(this._info[name]);
        }

        return [elem_data, this._info];
    }

    // ...............................................................................................................

    _get_single_data_reader = () => {

        const entry_reader = (nums_per_row, column_index) => {
            return [nums_per_row[column_index], 1];
        }

        return entry_reader;
    }

    // ...............................................................................................................

    _get_list_data_reader = () => {

        const list_reader = (nums_per_row, column_index) => {
            const num_data = nums_per_row[column_index];
            const data = nums_per_row.slice(column_index + 1);
            return [data, num_data + 1];
        }

        return list_reader;
    }

    // ...............................................................................................................

}


// ===================================================================================================================


class Binary_Element_Row_Parser {

    // ...............................................................................................................

    constructor(element_properties_list, is_little_endian) {

        this._info = {};
        this._property_readers = [];

        // Storage for progress callback
        this._after_progress = () => null;

        for(let line of element_properties_list) {

            // Parse property string to figure out how to read data from file
            const property = parse_property_string(line);
            const reader_select = property.is_list ? this._get_list_data_reader : this._get_single_data_reader;
            const reader_func = reader_select(property, is_little_endian);

            // Store parsing info/functionality
            this._property_readers.push({name: property.name, read: reader_func});
            this._info[property.name] = {
                type: property.data_type,
                is_list: property.is_list,
                min: null,
                max: null,
                mid: null,
                delta: null
            };
        }
    }

    // ...............................................................................................................

    set_progress_callback = (callback) => this._after_progress = callback;

    // ...............................................................................................................

    parse = async(dataview, start_offset, row_count) => {

        // Initialize empty arrays to hold parsed data for each property (e.g. x, y, z, etc.)
        const elem_data = {};
        const stats = {};
        for (const [name, property_info] of Object.entries(this._info)) {
            if (property_info.is_list) {
                stats[name] = new Property_List_Stats();
                elem_data[name] = new Array(row_count);
            } else {
                stats[name] = new Property_Value_Stats();
                elem_data[name] = make_new_data_array(property_info.type, row_count)
            }
        }

        // Set up state data for loop
        const state = {
            dataview, start_offset, elem_data, stats,
            total_bytelength: 0,
            property_readers: this._property_readers,
            info: this._info
        };

        const iter_func = (elem_row, s) => {

            // Loop over all properties for the given row of element data to accumulate listings
            for(let reader of s.property_readers) {

                // Read a single property entry
                const data_offset = s.start_offset + s.total_bytelength;
                const [new_data, data_bytelength] = reader.read(s.dataview, data_offset);
                s.total_bytelength += data_bytelength;

                // Store data & statistics
                const name = reader.name;
                s.elem_data[name][elem_row] = new_data;
                s.stats[name].update(new_data);
            }

            return;
        };

        // Parse data in a non-blocking way
        const loop_handler = new Nonblocking_ForLoop(50);
        loop_handler.set_progress_callback(this._after_progress);
        const [_, time_taken_ms] = await loop_handler.run(row_count, state, iter_func);

        // Record stats values for each of the properties
        for (const [name, stats_data] of Object.entries(stats)) {
            stats_data.write_output(this._info[name]);
        }

        return [elem_data, this._info, state.total_bytelength];
    }

    // ...............................................................................................................

    _get_single_data_reader = (property, is_little_endian) => {

        // Encode DataView getter function with ply property types
        // -> Reader function return: [function, bytelength]
        // -> The 'function' that is returned takes in a (DataView, Byte Offset)
        const data_reader_lut = {
            "char": (data_view, byte_offset) =>   [data_view.getInt8(byte_offset, is_little_endian),     1],
            "uchar": (data_view, byte_offset) =>  [data_view.getUint8(byte_offset, is_little_endian),    1],
            "short": (data_view, byte_offset) =>  [data_view.getInt16(byte_offset, is_little_endian),    2],
            "ushort": (data_view, byte_offset) => [data_view.getUint16(byte_offset, is_little_endian),   2],
            "int": (data_view, byte_offset) =>    [data_view.getInt32(byte_offset, is_little_endian),    4],
            "uint": (data_view, byte_offset) =>   [data_view.getUint32(byte_offset, is_little_endian),   4],
            "float": (data_view, byte_offset) =>  [data_view.getFloat32(byte_offset, is_little_endian),  4],
            "double": (data_view, byte_offset) => [data_view.getFloat64(byte_offset, is_little_endian),  8],
        }

        // Warning if we get an unrecognized property type
        const valid_property_type = (property.data_type in data_reader_lut);
        if (!valid_property_type) {
            alert(`Can't parse element data, got invalid property type: ${property.data_type}`);
            return data_reader_lut["char"];
        }

        return data_reader_lut[property.data_type];
    }

    // ...............................................................................................................

    _get_list_data_reader = (property, is_little_endian) => {

        // Create 'fake' properties, to use when building single readers needed to parse list data
        const count_property = {"data_type": property.count_type};
        const entry_property = {"data_type": property.data_type};
        const count_reader = this._get_single_data_reader(count_property, is_little_endian);
        const entry_reader = this._get_single_data_reader(entry_property, is_little_endian);

        const list_reader = (data_view, byte_offset) => {

            const [num_data, count_bytelength] = count_reader(data_view, byte_offset);
            const data = new Array(num_data);
            let total_bytelength = count_bytelength;
            let entry_offset, new_entry, entry_bytelength;
            for (let k = 0; k < num_data; k++) {

                // Read next entry
                entry_offset = byte_offset + total_bytelength;
                [new_entry, entry_bytelength] = entry_reader(data_view, entry_offset);

                // Update outputs
                data[k] = new_entry;
                total_bytelength += entry_bytelength;
            }

            return [data, total_bytelength];
        }

        return list_reader;
    }

    // ...............................................................................................................
}


// ===================================================================================================================


class PLY_Header_Parser {

    // ...............................................................................................................

    constructor() {
        this._text_decoder = new TextDecoder("ascii");
    }

    // ...............................................................................................................

    debug = (array_buffer, num_lines_to_peek = 500) => {

        /* Helper used to peek at the raw file data (as a string) */

        console.log(`\nHEADER DEBUG (first ${num_lines_to_peek} bytes as a string)`);
        console.log(this._bytes_to_string(array_buffer.slice(0, num_lines_to_peek)));

        return;
    }

    // ...............................................................................................................

    extract_header = (file_array_buffer) => {

        /*
        Function which extracts the header info from a .ply file.
        Works for both ascii & binary formatted files (binary ply files use ascii headers!)
        Returns:
            [header_blocks, header_bytelength]
        
        Where 'header_blocks' is a more json-like representation of the header info,
        and the bytelength tells you where to begin parsing the non-header data from the file
        */

        // Bail on bad data
        if (!this.is_valid(file_array_buffer)) return [[], 0];
        
        // For clarity
        const end_token = "end_header";
        const newline_token_in_binary_as_uint8 = 10;
        
        // Set iteration bounds
        // -> Can skip some starting characters, since the file format requires
        //    that it start with something like: "ply\nformat ....""
        const skip_start_chars = 20;
        const max_chars = Math.min(4096, file_array_buffer.byteLength);
        
        // Search for newline bytes, if found, check backwards for end token to finish
        // -> data is structured: "...\n...\n...\nend_header\n...(data)"
        // -> So we look for "\n" and then check backwards for "end_header" to find header length
        let header_bytelength = 0;
        const data_view = new DataView(file_array_buffer);
        for (let char_idx = skip_start_chars; char_idx < max_chars; char_idx++) {
            const is_newline = (data_view.getUint8(char_idx) === newline_token_in_binary_as_uint8);
            if (is_newline) {
                const slice_start = (char_idx - end_token.length);
                const possible_end_token_bytes = file_array_buffer.slice(slice_start, char_idx);
                const is_end = (this._bytes_to_string(possible_end_token_bytes) === end_token);
                if (is_end) {
                    header_bytelength = 1 + char_idx;
                    break;
                }
            }
        }

        // Handle error case, where we don't find the end token
        const parse_error = (header_bytelength === 0);
        if (parse_error) {
            alert(`Error parsing ply header! Couldn't find end token: ${end_token}`);
            return [[], header_bytelength];
        }

        // Get header into nicer format before returning
        const header_str = this._bytes_to_string(file_array_buffer.slice(0, header_bytelength - 1));
        const header_blocks = this._header_string_to_blocks(header_str);

        return [header_blocks, header_bytelength];
    }

    // ...............................................................................................................

    _bytes_to_string = (array_buffer) => this._text_decoder.decode(array_buffer);

    // ...............................................................................................................

    is_valid = (file_array_buffer, enable_alert = false) => {

        /* 
        ply model files MUST start with 'ply' as the first 3 characters of the file
        This function works for both ascii & binary formatted ply files!
        Returns:
            true if given a valid ply file, false otherwise
        */
        
        // Check for expected file coding
        const file_code = this._bytes_to_string(file_array_buffer.slice(0, 3));
        const expected_filecode = "ply";
        const is_valid_ply_file = (file_code === expected_filecode);

        // Warning for bad formats
        if (!is_valid_ply_file) {
            console.error("Invalid ply file!", 
            "\n", `Expecting file code: ${expected_filecode}`,
            "\n", `Got: ${file_code}`);
            if (enable_alert) alert("Error! Not a valid ply file!");
        }

        return is_valid_ply_file;
    }

    // ...............................................................................................................

    _header_string_to_blocks = (header_str) => {

        /*
        Function which converts a single/continuous ply header string
        into an object with the format:
        {
            format: (a single string),
            comments: [list of strings, one for each comment in the file],
            elements: [list of element block objects]
        }

        The element block objects have the form:
        {
            name: (string),
            count: integer,
            properties: [list of strings]
        }

        There is one element block object for each listing in the header.
        An example of the input to this function is:

        header_str = "
        ply\nformat ascii 1.0\ncomment a comment\nelement vertex 5\nproperty float x\n ...
        property float y\nproperty float z\nelement face 12\n ...
        property list uchar uint vertex_indices\nend_header
        "
        
        The corresponding output of this function would be:
        {
            format: "format ascii 1.0",
            comments: ["comment a comment"],
            elements: [
            {name: "vertex", count: 5, properties: [
                "property float x", "property float y", "property float z"
            ]},
            {name: "face", count: 12, properties: [
                "property list uchar uint vertex_indices"
            ]}
            ]
        }
        */

        // Initialize return data
        let output = {filecode: null, format: null, comments: [], elements: []};

        // Split header for easier access & grab known data lines
        const header_as_strs_list = header_str.split("\n");
        output.filecode = header_as_strs_list[0];
        output.format = header_as_strs_list[1];

        // Get any file comments (starts at 3rd line of header)
        // -> We don't know how many comments exist in advance, so have to loop-check
        const max_check_comments = 500;
        const first_comment_idx = 2;
        let first_element_idx = 0;
        for (let k = 0; k < max_check_comments; k++){
            const next_comment_idx = k + first_comment_idx;
            const next_str = header_as_strs_list[next_comment_idx];
            const is_comment = next_str.startsWith("comment");
            if (is_comment) {
                output.comments.push(next_str);
            } else {
                first_element_idx = next_comment_idx;
                break;
            }
        }

        // Remaining lines will be element entries,
        // except last entry, which is end token (can ignore)
        const element_strs_list = header_as_strs_list.slice(first_element_idx, -1);
        output.elements = this._element_strings_to_blocks(element_strs_list);

        return output;
    }

    // ...............................................................................................................
    
    _element_strings_to_blocks = (element_strs_list) => {

        /*
        Function which takes in list of strings representing the element data from header,
        and parses into separate listings for each of the blocks of element data
        that are present (e.g. vertex and face data).

        Returns a list of objects of the form:
            {name, count, properties}

        Where 'properties' is a list of the full property string data
        For example:
            ["property float x", "property float y", "property float z", etc.]
        */

        // For clarity
        const element_token = "element";
        const property_token = "property";
        const element_delimiter = " ";

        // Remove any non-element related lines (for example, some formats place comments after elements)
        const is_elem_line = (line) => line.startsWith(element_token);
        const is_prop_line = (line) => line.startsWith(property_token);
        const only_element_strs_list = element_strs_list.filter(line => is_elem_line(line) || is_prop_line(line));

        // Sanity check, make sure the first entry refers to element data!
        const expected_element_str = only_element_strs_list[0];
        const parse_ok = expected_element_str.startsWith(element_token);
        if (!parse_ok) {
            alert(`
                Error parsing header file!\n
                Expected element entry, got:\n
                ${expected_element_str}`);
            return output;
        }

        // Loop over each element line, checking if it is an "element" or "property" entry
        // -> "element" entries lead to creating new in-progress listings
        // -> "property" entries are appended to current in-progress listing
        const elem_listings = [];
        for(let line_str of only_element_strs_list) {
        
            // Start a new blank listing every time we hit an element line
            if (is_elem_line(line_str)) {
                const [token, name, count] = line_str.split(element_delimiter);
                const new_listing = { name: name, count: Number(count), properties: [] };
                elem_listings.push(new_listing);
                continue;
            }

            // Sanity check
            if (!is_prop_line(line_str)) {
                alert(`
                    Error parsing element listings!\n
                    Expected property line, but got:\n
                    ${line_str}`)
                return elem_listings;
            }

            // Store property lines
            const last_elem_idx = elem_listings.length - 1;
            elem_listings[last_elem_idx].properties.push(line_str);
        }

        return elem_listings;
    }

    // ...............................................................................................................
}


// ===================================================================================================================


class PLY_to_JSON_Parser {

    // ...............................................................................................................

    constructor(progress_bar_ref) {

        // Store reference to progress bar, updated when parsing
        this._progress_bar = progress_bar_ref;

        // Storage for parsing results
        this.header_json = null;
        this.header_bytelength = null;
        this.model_json = null;
        this.available = false;
    }

    // ...............................................................................................................

    parse_ply_from_string = async(ply_as_string) => {

        /* Used to allow directly providing ply data (i.e. as a js string) */

        // Convert string representation to an array buffer to use existing file-parsing code
        const ascii_encoder = new TextEncoder("ascii");
        const array_buffer = ascii_encoder.encode(ply_as_string).buffer;
    
        return await parse_ply_from_array_buffer(array_buffer);
    }

    // ...............................................................................................................

    parse_ply_from_array_buffer = async(array_buffer) => {

        // For output
        let parse_ok = false;

        // Begin timing, since parsing can be a slow operation (good to know speed!)
        const start_time_ms = performance.now();

        // Get header info from ply file
        const header_parser = new PLY_Header_Parser();
        //header_parser.debug(ply_as_array_buffer);
        const [header_json, header_bytelength] = header_parser.extract_header(array_buffer);
        this.header_json = header_json;
        this.header_bytelength = header_bytelength;

        // For convenience
        const file_format = String(header_json.format).toLowerCase();
        const is_ascii = file_format.includes("ascii");
        const is_binary = file_format.includes("binary");

        // Warning if we get unexpected data format!
        // Figure out which data we're working with
        const unexpected_format = (!is_ascii) && (!is_binary);
        if (unexpected_format) {
            alert(`Error parsing model data, unrecognized format: ${file_format}`);
            console.error(
                "Expecting 'ascii' or 'binary' format",
                `Got: ${file_format}`);
            return parse_ok;
        }

        // Parse the model data
        const parse_func = is_binary ? this._parse_data_binary : this._parse_data_ascii;
        const data_to_parse = new DataView(array_buffer, header_bytelength);
        this.model_json = await parse_func(data_to_parse, header_json, this._progress_bar);
        parse_ok = true;

        // Provide timing feedback
        const time_taken_ms = performance.now() - start_time_ms;
        console.log(`${Math.round(time_taken_ms)} ms to parse ply data`);

        // Mark data as being available for use
        this.available = true;

        return parse_ok;
    }

    // ...............................................................................................................
    
    reset = () => {
        this.header_json = null;
        this.header_bytelength = null;
        this.model_json = null;
        this.available = false;
    }

    // ...............................................................................................................

    _parse_data_ascii = async(data_bytes, header_blocks, progbar_ref) => {

        /*
        Function used to parse the data-segment of a ply file
        (as opposed to the header), when dealing with ascii formatted data
        Returns:
            model_json
        */
    
        // Initialize output
        const all_element_data = {};
    
        // Used for progress bar title
        const num_elems = header_blocks.elements.length;
        let elem_idx = 1;
    
        // Get data as a list of strings, since it's much easier to parse
        const ascii_decoder = new TextDecoder("ascii");
        const data_str = ascii_decoder.decode(data_bytes);
        const data_strs_list = data_str.split("\n");
    
        // For each element, parse binary data
        let line_offset = 0;
        for (let {name, count, properties} of header_blocks.elements) {
    
            // Provide user-friendly progress bar title for feedback
            progbar_ref.set_title(`Parsing ply element data (${elem_idx} of ${num_elems})`);
            elem_idx += 1;
    
            // Get data parsing rules for each element (changes based on listed properties!)
            const elem_parser = new Ascii_Element_Row_Parser(properties);
            elem_parser.set_progress_callback(progbar_ref.update);
            const [elem_data, elem_info] = await elem_parser.parse(data_strs_list, line_offset, count);
    
            // Store results & update offset for parsing the next block of element data
            all_element_data[name] = {data: elem_data, info: elem_info, count: count};
            line_offset += count;
        }
    
        return all_element_data;
    }

    // ...............................................................................................................

    _parse_data_binary = async(data_view, header_blocks, progbar_ref) => {

        /*
        Function used to parse the data-segment of a ply file
        (as opposed to the header), when dealing with binary formatted data
        Returns:
            model_json
        */
        
        // Initialize output
        const all_element_data = {};
        
        // Used for progress bar title
        const num_elems = header_blocks.elements.length;
        let elem_idx = 1;
    
        // For each element, parse binary data
        const is_little_endian = header_blocks.format.includes("little_endian");
        let byte_offset = 0;
        for (let {name, count, properties} of header_blocks.elements) {
    
            // Provide user-friendly progress bar title for feedback
            progbar_ref.set_title(`Parsing ply element data (${elem_idx} of ${num_elems})`);
            elem_idx += 1;
    
            // Get data parsing rules for each element (changes based on listed properties!)
            const elem_parser = new Binary_Element_Row_Parser(properties, is_little_endian);
            elem_parser.set_progress_callback(progbar_ref.update);
            const [elem_data, elem_info, elem_bytelength] = await elem_parser.parse(data_view, byte_offset, count);
    
            // Store results & update offset for parsing the next block of element data
            all_element_data[name] = {data: elem_data, info: elem_info, count: count};
            byte_offset += elem_bytelength;
        }
    
        return all_element_data;
    }

    // ...............................................................................................................
}



// -------------------------------------------------------------------------------------------------------------------
// Functions

// ...................................................................................................................

function parse_property_string(property_line_str) {

    // Each property line is formatted as either:
    // a) "property (type) (name)"
    // b) "property list (count type) (entries type) (name)"
    // -> All types are numeric, and correspond to some number of bytes needed for representation
    // -> List types represent entries whose length can vary (which is indicated with the counter variable)

    // Split the given property line on spaces to get components
    const line_split = property_line_str.split(" ");
    
    // All properties have the data type and name as the last 2 line entries 
    const [data_type, property_name] = line_split.slice(-2);

    // Check if we have a property list, and set the count type if needed
    const is_property_list = (line_split[1] === "list");
    const count_type = is_property_list ? line_split[2] : null;

    const property_dict = {
        is_list: is_property_list,
        count_type: count_type,
        data_type: data_type,
        name: property_name
    }
    return property_dict;
}

// ...................................................................................................................

function make_new_data_array(ply_data_type_str, array_size) {

    // Mapping of ply data types to javascript array types
    // See: http://paulbourke.net/dataformats/ply/
    const ply_data_to_array_format_lut = {
        "char": Int8Array,
        "uchar": Uint8Array,
        "short": Int16Array,
        "ushort": Uint16Array,
        "int": Int32Array,
        "uint": Uint32Array,
        "float": Float32Array,
        "double": Float64Array
    }

    const valid_type = (ply_data_type_str in ply_data_to_array_format_lut);
    if (!valid_type) {
        console.warn(`Unrecognized ply data array type: ${ply_data_type_str}`);
        return new Array(array_size);
    }

    const array_type = ply_data_to_array_format_lut[ply_data_type_str];
    return new array_type(array_size);
}

// ...................................................................................................................