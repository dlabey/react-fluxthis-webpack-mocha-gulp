'use strict';

var config = require('./webpack.config');
var gutil = require('gulp-util');
var path = require('path');
var gulp = require('gulp');
var nodefn = require('when/node');
var server = require('./test/server');
var webpack = require('webpack');
var execFile = require('child_process').execFile;
var notifier = require('node-notifier');
var startTestServer;
var stopTestServer;
var webpackRun;
var runTests;

function notifyBuildFailed () {
	gutil.log(gutil.colors.red('Build failed'));
	notifier.notify({
		title: 'Build failed',
		message: 'see console for details',
		sound: true,
		icon: __dirname + '/test/notifications/bad.png'
	});
}

function notifyBuildPassed () {
	gutil.log(gutil.colors.blue('Build complete'));
	notifier.notify({
		title: 'Build complete',
		message: 'see console for details',
		icon: __dirname + '/test/notifications/good.png'
	});
}

function notifyTestsFailed (err) {
	gutil.log(gutil.colors.red('Tests failed'));
	var notification = {
		title: 'Tests failed',
		sound: true,
		icon: __dirname + '/test/notifications/bad.png'
	};

	if(err.url) {
		notification.message = 'Click to view in browser';
		notification.open = err.url;
	}

	notifier.notify(notification);
}

function notifyTestsPassed () {
	gutil.log(gutil.colors.blue('Tests passed'));
	notifier.notify({
		title: 'Tests passed',
		message: 'see console for details',
		icon: __dirname + '/test/notifications/good.png'
	});
}

function notifyTestBuildFailed () {
	gutil.log(gutil.colors.red('Test build failed'));
	notifier.notify({
		message: 'Test build failed',
		sound: true,
		icon: __dirname + '/test/notifications/bad.png'
	});
}

process.env.NODE_PORT = process.env.NODE_PORT || 21113;

runTests = nodefn.lift(function (callback) {
	var url = 'http://localhost:' + process.env.NODE_PORT + '/index.html';
	var file = path.join('node_modules','.bin','mocha-phantomjs.cmd');
	var args = ['-R', 'spec', url];
	
	gutil.log('Starting unit tests');
	try {

		execFile(file, args, function (err, stdout, stderr) {
			var code = (err && err.code) || 0; 
			
			gutil.log(stdout);
			gutil.log(stderr);
			gutil.log('Mocha exited with code ' + code);
			
			//non zero! bad!
			if(code) {
				err = new Error('Client tests failed');
				err.url = url;
			}

			gutil.log('Unit tests finished');
			callback(err);
		});
	}
	catch (err) {
		gutil.log('Fatal error', err.stack);
		callback(err);
	}
});

startTestServer = nodefn.lift(function (callback) {
	gutil.log('Starting test server on port ' + process.env.NODE_PORT);
	server.start(process.env.NODE_PORT, callback);
});

stopTestServer = nodefn.lift(function (callback) {
	gutil.log('Stopping test server on port ' + process.env.NODE_PORT);
	server.stop(callback);
});

webpackRun = nodefn.lift(nodefn.lift(webpack));

gulp.task('dev', function (callback) {
	process.env.NODE_ENV = 'development';
	
	config.forEach(function (config) {
		config.devtool = 'source-map';
		config.debug = true;
	});

	webpackRun(config)
		.then(startTestServer(), notifyBuildFailed)
		.then(runTests())
		.then(notifyTestsPassed, notifyTestsFailed)		
		.ensure(stopTestServer())
		.done(callback);
});

gulp.task('prod', function (callback) {
	process.env.NODE_ENV = 'production';
	
	config.forEach(function (config) {
		config.optimize = true;
		config.output.filename = '[filename].min.js'
	});

	webpackRun(config)
		.then(startTestServer(), notifyBuildFailed)
		.then(runTests())
		.then(notifyTestsPassed, notifyTestsFailed)		
		.ensure(stopTestServer())
		.done(callback);
});

gulp.task('watch', function (callback) {
	var compiler;
	var testCompiler;

	process.env.NODE_ENV = 'development';

	config.forEach(function (config) {
		config.devtool = 'source-map';
		config.debug = true;
	});
	
	compiler = webpack(config[0]);
	testCompiler = webpack(config[1]);

	startTestServer().ensure(function () {
		compiler.watch(200, function (err, stats) {
			if(err) {
				notifyBuildFailed(err);
			}
			else {
				var jsonStats = stats.toJson();	
				
				if(jsonStats.warnings.length > 0) {
					jsonStats.warnings.forEach(function (warning) {
						gutil.log(gutil.colors.yellow('WARN: ') + warning);
					});
				}

				if(jsonStats.errors.length > 0) {
					jsonStats.errors.forEach(function (error) {
						gutil.log(gutil.colors.red('ERROR: ') + error);
					});

					notifyBuildFailed();
				}
				else {
					notifyBuildPassed();
				}
			}
		});

		testCompiler.watch(200, function (err, stats) {
			if(err) {
				notifyTestBuildFailed();
			}
			else {
				var jsonStats = stats.toJson();	
					
				if(jsonStats.warnings.length > 0) {
					jsonStats.warnings.forEach(function (warning) {
						gutil.log(gutil.colors.yellow('WARN: ' + warning));
					});
				}

				if(jsonStats.errors.length > 0) {
					jsonStats.errors.forEach(function (error) {
						gutil.log(gutil.colors.yellow('ERROR: ' + error));
					});

					notifyTestBuildFailed();
				}
				else {
					runTests().done(notifyTestsPassed, notifyTestsFailed);
				}
			}
		});
	});
});

