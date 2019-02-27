const gulp = require("gulp");
const { SimpleKeyStoreSigner, InMemoryKeyStore, KeyPair, LocalNodeConnection, NearClient, Near } = require('nearlib');
const neardev = require('nearlib/dev');
const UnencryptedFileSystemKeyStore = require('./unencrypted_file_system_keystore');
const fs = require('fs');

gulp.task("build:model",  function (done) {
  const asc = require("assemblyscript/bin/asc");
  asc.main([
    "model.ts",
    "--baseDir", "./out",
    "--nearFile", "../out/model.near.ts",
    "--measure"
  ], done);
});

gulp.task("build:bindings",  function (done) {
  console.log('bb1')
  const asc = require('assemblyscript/bin/asc');
  asc.main([
    "main.ts",
    "--baseDir", "./out",
    "--binaryFile", "../out/main.wasm",
    "--nearFile", "../out/main.near.ts",
    "--measure"
  ], done);
});

gulp.task("build:all", gulp.series('build:model', 'build:bindings', function (done) {
  done();
}));

gulp.task('copyfiles', function(done) {
  return gulp.src('./assembly/**/*')
      .pipe(gulp.dest('./out/'));
});

gulp.task('build', gulp.series('copyfiles', 'build:all', function(done) {
  done();
}));

// Only works for dev environments
gulp.task('createDevAccount', async function(argv) {
    const keyPair = await KeyPair.fromRandomSeed();
    const accountId = argv.account_id;
    const nodeUrl = argv.node_url;

    const options = {
        nodeUrl,
        accountId,
        useDevAccount: true,
        deps: {
            keyStore: new InMemoryKeyStore(),
            storage: {},
        }
    };

    const near = await neardev.connect(options);
    await neardev.createAccountWithLocalNodeConnection(accountId, keyPair.getPublicKey());
    const keyStore = new UnencryptedFileSystemKeyStore();
    keyStore.setKey(accountId, keyPair);
});


async function deployContractAndWaitForTransaction(accountId, contractName, data, near) {
    const deployContractResult = await near.deployContract(accountId, contractName, data);
    const waitResult = await near.waitForTransactionResult(deployContractResult);
    return waitResult;
}

gulp.task('deploy', async function(argv) {
    const keyStore = new UnencryptedFileSystemKeyStore();
    let accountId = argv.account_id;
    if (!accountId) {
        // see if we only have one account in keystore and just use that.
        const accountIds = await keyStore.getAccountIds();
        if (accountIds.length == 1) {
            accountId = accountIds[0];
        }
    }
    if (!accountId) {
        throw 'Please provide account id and make sure you created an account using near create_account'; 
    }
    const nodeUrl = argv.node_url;
    const options = {
        nodeUrl,
        accountId,
        deps: {
          keyStore,
          storage: {},
        }
    };

    const near = await neardev.connect(options);
    const contractData = [...fs.readFileSync('./out/main.wasm')];
  
    // Contract name
    const contractName = argv.contract_name;
    console.log(
        "Starting deployment. Account id " + accountId + ", contract " + contractName + ", url " + nodeUrl);
    const res = await deployContractAndWaitForTransaction(
        accountId, contractName, contractData, near);
    if (res.status == "Completed") {
        console.log("Deployment succeeded.");
    } else {
        console.log("Deployment transaction did not succeed: ", res);
    }
});
