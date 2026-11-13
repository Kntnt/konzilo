// How a command of the core (bin/) ends with a status at once, rather than when it has nothing
// left to do: once what it wrote to standard output and standard error has been taken. Written
// to a pipe, as the builder reads a command's report, a write larger than the pipe holds waits
// for the reader, and process.exit() would end the program and cut it.

// Ends the program with `status` once all it wrote has been taken; the promise it gives never
// settles, so that a command that awaits it does nothing more.
export function exitOnceWritten(status) {
  let open = 2;
  const taken = () => {
    open -= 1;
    if (open === 0) process.exit(status);
  };
  process.stdout.write('', taken);
  process.stderr.write('', taken);
  return new Promise(() => {});
}
