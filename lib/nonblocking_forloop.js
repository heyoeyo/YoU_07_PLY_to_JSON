

  class Nonblocking_ForLoop {

    /*
    Helper class used to run a slow 'for loop' without blocking the UI completely
    Basic usage is to initialize the object, then call the run function:

        const looper = new Nonblocking_Loop();
        const [final_state, time_taken_ms] = await looper.run(num_iterations, state, iter_func);
    
    The behavior of the run function is analogous to:

        state = {...}
        for(let i = 0; i < num_iterations; i++) {
            iter_func(i, state);
        }
    
    Except that the loop will run in a sort of 'async' way (i.e. the run call doesn't block unless awaited)

    Notes:
      1. A progress update callback can be supplied (for example, to update a progress bar), by using:
        looper.set_progress_callback((progress_pct) => console.log("Progress:", progress_pct, "%"))
      2. The constructor of this object takes an optional 'max blocking delay', which determines how
        often control is given back to the UI. Lower values will cause the loop to take longer, but
        give a smoother/less choppy UI experience during the loop
      3. After starting the loop, it can be stopped using the .cancel() function

    */

    // ...............................................................................................................

    constructor(max_blocking_delay_ms = 12) {

      // Internal state variables
      this._anim_id = null;
      this._loop_start_time_ms = null;
      this._max_loop_duration_ms = max_blocking_delay_ms;
      
      // Callbacks
      this._after_progress = null;
      this._resolve_promise = null;
      this._reject_promise = null;
    }

    // ...............................................................................................................

    set_progress_callback = (callback) => this._after_progress = callback;

    // ...............................................................................................................

    run = (num_iterations, state = null, iter_func = (idx, s) => console.log("NBLoop:", idx)) => {

      // Create promise for managing waiting time
      // (NOTE: this seems like a very strange way to manage this...)
      const result = new Promise((resolve, reject) => {
        this._resolve_promise = resolve;
        this._reject_promise = reject;
      });

      // Explain structure of iteration function, if not provided
      if (iter_func === null) {
        console.log("Must provide an iteration function to the Nonblocking loop runner!",
          "\nFunction should be of the form: (index, state) => {...}",
          "\nWhich will be called for each of the supplied 'num_iterations");
          this._reject_promise("Bad iteration function");
          return result;
      }

      // Fill in blank callbacks if none were provided
      const has_progress_func = typeof(this._after_progress) === "function";
      if (!has_progress_func) this._after_progress = () => null;

      // Begin non-blocking loop!
      this._anim_id = requestAnimationFrame(() => {
        this._loop_start_time_ms = performance.now();
        this._loop_nonblocking(0, num_iterations, state, iter_func);
      });
      
      return result;
    }

    // ...............................................................................................................

    cancel = () => {

      // Prevent futher loop iterations
      cancelAnimationFrame(this._anim_id);

      // For clarity
      const loop_ok = false;
      const final_state = null;
      const time_taken_ms = performance.now() - this._loop_start_time_ms;

      // Trigger promise
      const have_promise = (typeof(this._resolve_promise) === "function");
      if (have_promise) this._resolve_promise([loop_ok, final_state, time_taken_ms]);

      return;
    }
    
    // ...............................................................................................................

    _loop_nonblocking = (start_idx, num_iterations, state, iter_func) => {

      // Figure out end timing
      const block_start_time_ms = performance.now();
      const end_time_ms = block_start_time_ms + this._max_loop_duration_ms;

      // Check if we're done looping
      const stop_looping = (start_idx >= num_iterations);
      if (stop_looping) {

        // For clarity
        const loop_ok = true;
        const time_taken_ms = block_start_time_ms - this._loop_start_time_ms;

        this._resolve_promise([loop_ok, state, time_taken_ms]);
        
        return;
      }
      
      // Loop until we run out of time
      let idx;
      for(idx = start_idx; idx < num_iterations; idx++) {
        iter_func(idx, state);
        if (performance.now() > end_time_ms) break;
      }

      // Update progress indicators
      const progress_pct = Math.round(100 * idx / num_iterations);
      this._after_progress(progress_pct);

      // Recursively call this function on the next frame update
      // (this is what gives non-blocking behavior!)
      this._anim_id = requestAnimationFrame(() => this._loop_nonblocking(idx + 1, num_iterations, state, iter_func));

      return;
    }

    // ...............................................................................................................

  }