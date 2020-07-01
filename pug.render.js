const pug = require('pug');
const glob = require('glob');
const path = require('path');
const fs = require('fs');

// Render all pug files except `templates`.
glob("!(templates)/**/*.pug", { root: path.resolve(__dirname, "src") }, (err, files)=>{

  console.log("Input files:", files);

  files.forEach((file)=>{

    // Replace file type and directory to target directory and `html` file type.
    const target = path.resolve(
      __dirname,
      file
      .replace(/^src\//, "dist-web/")
      .replace(/\.pug$/, ".html")
    );

    // If directory not exist, create directory.
    fs.existsSync(path.parse(target).dir) ? true : fs.mkdirSync(
      path.parse(target).dir, { recursive: true }
    );

    // Write compiled pug file.
    fs.writeFileSync(target, pug.compileFile(file)())
  })

  console.log("Render done.");
})
