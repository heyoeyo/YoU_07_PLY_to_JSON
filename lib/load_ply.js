
class PLY_File_Loader {

    /* Helper wrapped around an HTML <input type="file"> element which handles uploading/processing of ply files */

    // ...............................................................................................................

    constructor(input_elem_id, progress_bar_ref) {

        // Reference to progress bar indicator (used when uploading files) + load timing variable
        const progbar_is_str = (typeof(progress_bar_ref) === "string");
        this._progress_bar = progbar_is_str ? document.getElementById(progress_bar_ref) : progress_bar_ref;
        
        // Allocate storage for file data parsing
        this._loaded_data = {};
        this._reset_loaded_data();

        // Allocate dummy callbacks for handling work after finishing file loading
        this._on_complete_callback = (filename, array_buffer) => console.log("DEBUG - Load complete:", array_buffer);
        this._on_begin_callback = () => console.log("DEBUG - Beginning file load");

        // Set up file input for handling user files
        const input_elem = document.getElementById(input_elem_id);
        input_elem.type = "file";
        input_elem.accept = ".ply,.PLY";
        input_elem.addEventListener("change", this._on_file_select);

        // Set up special handler to prevent user from queueing up multiple file load attempts from fast clicking
        this._prev_click_timestamp = -1000;
        input_elem.addEventListener("click", this._prevent_multi_clicks);

        // Grab the label linked to the file input, for disabling/enabling the control
        const input_label = document.querySelector(`label[for=${input_elem_id}]`);
        this._input_label = input_label;
    }

    // ...............................................................................................................

    set_load_begin_callback = (callback) => this._on_begin_callback = callback;
    set_load_complete_callback = (callback) => this._on_complete_callback = callback;
    _record_loading_time = () => this._loaded_data.start_time_ms = performance.now();

    // ...............................................................................................................

    load_from_url = async(url) => {

        /* Function used to load ply data from a url */
    
        // Grab array buffer data
        const [load_ok, filename, array_buffer] = await _load_from_url(url);
        if (!load_ok) return;

        // Process array buffer as needed
        this._on_begin_callback();
        this._on_complete_callback(filename, array_buffer);
        
        return;
    }

    // ...............................................................................................................

    load_from_string = (filename, ply_as_string) => {

        /* Function used to load ply data from an ascii-encoded string (i.e. within a javascript variable!) */

        const array_buffer = _load_from_string(filename, ply_as_string);
        this._on_begin_callback();
        this._on_complete_callback(filename, array_buffer);

        return;
    }

    // ...............................................................................................................

    _reset_loaded_data = () => {

        // Reset the file reader itself (to clear result data) & (re-)attach event listeners
        const new_reader = new FileReader();
        new_reader.addEventListener("progress", this._on_progress);
        new_reader.addEventListener("loadstart", this._record_loading_time);
        new_reader.addEventListener("loadend", this._on_load_end);

        // Reset data records
        this._loaded_data = {name: null, reader: new_reader, start_time_ms: null}

        return;
    }

    // ...............................................................................................................

    _on_load_end = (event) => {

        /* Called when file loading finishes */

        // Get loaded data if possible
        const filename = this._loaded_data.name;
        const file_array_buffer = this._loaded_data.reader.result;
        const load_ok = (file_array_buffer != null);
        if (!load_ok) {
            console.warn("File reader failed... empty result!");
            return;
        }
        
        // Handle timing feedback
        const load_start_time = this._loaded_data.start_time_ms;
        if (load_start_time != null) {
            const loading_time_ms = performance.now() - load_start_time;
            console.log(`${Math.round(loading_time_ms)} ms to load ply file`);
        }

        // Clear out file data to help free up some RAM before further processing begins
        this._reset_loaded_data();
        this._on_complete_callback(filename, file_array_buffer);

        return;
    }

    // ...............................................................................................................

    _on_progress = (event) => {

        /* Called periodically as a file is loaded */

        const loaded = event.loaded;
        const total = event.total;
        if (loaded < total && total > 0) {
            const progress_norm = loaded / total;
            const progress_pct = Math.round(100 * progress_norm);
            this._progress_bar.update(progress_pct);
        }

        return;
    }

    // ...............................................................................................................
    
    _on_file_select = (event) => {

        /* Called when a user selects a new file to load */

        // Bail if we didn't get any files (not sure this is even possible?)
        const file_list = event.target.files;
        if (file_list.length <= 0) return;

        // Grab file to load
        const new_file_to_load = file_list[0];
        const new_file_name = new_file_to_load.name;
        this._loaded_data.name = new_file_name;
        console.log("\nNew file: ", new_file_name);

        // Update progress bar to indicate loading
        this._progress_bar.set_title("Loading file", 0);

        // Begin loading file data (this is non-blocking)
        // -> Triggers 'progress' event as file loads
        // -> Triggers 'load' event when loading finishes
        this._on_begin_callback();
        this._loaded_data.reader.readAsArrayBuffer(new_file_to_load);

        return;
    }

    // ...............................................................................................................

    _prevent_multi_clicks = (event) => {

        const curr_time = event.timeStamp;
        const click_too_fast = (curr_time - this._prev_click_timestamp) < 500;
        if (click_too_fast) event.preventDefault();
        this._prev_click_timestamp = curr_time;
    }

    // ...............................................................................................................
}


// ===================================================================================================================


class PLY_String_Loader_Menu {

    /* Helper wrapped around an HTML <select> element which loads/processes ply string data */

    // ...............................................................................................................

    constructor(elem_id, model_name_to_ply_string_dict) {

        // Store reference to menu element for future re-use
        this._menu_elem = document.getElementById(elem_id);
        
        // Allocate dummy callbacks for handling work after finishing file loading
        this._on_complete_callback = (filename, array_buffer) => console.log("DEBUG - Load complete:", array_buffer);
        this._on_begin_callback = () => console.log("DEBUG - Beginning file load");
        
        // Set up initial menu
        this._models_dict = null;
        this._create_menu_options(model_name_to_ply_string_dict);
        this._menu_elem.addEventListener("change", this._on_change);
    }

    // ...............................................................................................................

    set_load_begin_callback = (callback_func) => this._on_begin_callback = callback_func;
    set_load_complete_callback = (callback_func) => this._on_complete_callback = callback_func;

    // ...............................................................................................................

    select_model = (model_key) => {

        const is_changed = (model_key != this._menu_elem.value);
        if (is_changed) {
            this._menu_elem.value = model_key;
            this._on_change();
        }

        return;
    }

    // ...............................................................................................................

    _on_change = async() => {

        // Get current menu selection
        const new_selection = this._menu_elem.value;
        
        // Load from model data if possible
        const is_model_select = Object.keys(this._models_dict).includes(new_selection);
        if (is_model_select) {
            this._on_begin_callback();
            const array_buffer = _load_from_string(new_selection, this._models_dict[new_selection]);
            await this._on_complete_callback(new_selection, array_buffer);

            // Return focus to menu element, in case it is lost by post-processing (e.g. progress bar!)
            this._menu_elem.focus();
        }
        
        // Warn about selection error
        const bad_selection = (!is_model_select);
        if (bad_selection) {
            console.error(`Unrecognized selection: ${new_selection}`,
            "\nCannot load model data");
        }

        return;
    }

    // ...............................................................................................................

    _create_menu_options = (model_dict) => {

        // Fill out menu options
        for (let key of Object.keys(model_dict)) {
            const new_option = document.createElement("option");
            const capitalized_key = key.charAt(0).toUpperCase() + key.slice(1);
            new_option.innerText = capitalized_key;
            new_option.value = key;
            this._menu_elem.options.add(new_option);
        }

        // Store model data for look-ups in the future
        this._models_dict = model_dict;

        return;
    }

    // ...............................................................................................................
}


// -------------------------------------------------------------------------------------------------------------------
// Functions

// ...................................................................................................................

async function _load_from_url(url) {

    /* Function used to load ply data from a url, returns an array buffer */
    
    // Initialize outputs
    let load_ok = false;
    let array_buffer = null;

    // Figure out a 'file name' for the requested data
    const filename = url.split("/").pop();
    console.log(`\nLoading PLY from url: ${filename}`);

    // Try to fetch data
    let response = {ok: false};
    try { 
        response = await fetch(url); 
    } catch {
        console.log(`Error fetching! Bad url or CORS?\n${url}`);
    }
    
    // Bail on bad responses
    if (!response.ok) {
        console.error(`Failed to load ply data from url\n${url}`);
        return [load_ok, array_buffer];
    }
    
    // Try to get data into an array buffer if possible
    try {
        array_buffer = await response.arrayBuffer();
        load_ok = true;
    } catch {
        console.log(`Error parsing ply data from url! Couldn't create array buffer\n${url}`);
    }
    
    return [load_ok, filename, array_buffer];
}

// ...................................................................................................................

function _load_from_string(model_name, ply_as_string) {

    /* Function used to load ply data from an ascii string, returns an array buffer */
        
    console.log(`\nLoading PLY from string: ${model_name}`);

    // Convert string representation to an array buffer for futher processing
    const ascii_encoder = new TextEncoder("ascii");
    const array_buffer = ascii_encoder.encode(ply_as_string).buffer;

    return array_buffer;
}

// ...................................................................................................................