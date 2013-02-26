/**
 * Concat wrapper with Bower support
 *
 * @author Artem Sapegin (http://sapegin.me)
 */


/*jshint node:true */
module.exports = function(grunt) {
	'use strict';

	var fs = require('fs');
	var path = require('path');
	var bower = require('bower');
	var _ = grunt.util._;

	grunt.registerMultiTask('bower', 'Concat wrapper with Bower support.', function() {
		var done = this.async();

		// Options
		var includes = ensureArray(this.data.include || []);
		var excludes = ensureArray(this.data.exclude || []);
		var dependencies = this.data.dependencies || {};

		bowerJavaScripts(function(bowerFiles) {
			// @todo concat bleat!
			console.log(bowerFiles);
			done();
		}, includes, excludes, dependencies);
	});

	function bowerJavaScripts(allDone, includes, excludes, dependencies) {
		grunt.util.async.parallel({
			map: bowerList('map'),
			components: bowerList('paths')
		}, function(err, lists) {
			// Combine dependencies list
			_.each(lists.map, function(component, name) {
				if (component.dependencies && !dependencies[name]) {
					dependencies[name] = Object.keys(component.dependencies);
				}
			});

			// Convert all dependencies to arrays
			_.each(dependencies, function(deps, name) {
				dependencies[name] = ensureArray(deps);
			});

			// List of main files
			var jsFiles = {};
			_.each(lists.components, function(component, name) {
				if (includes.length && _.indexOf(includes, name) === -1) return;
				if (excludes.length && _.indexOf(excludes, name) !== -1) return;

				var main = findMainFile(name, component);
				if (main) {
					jsFiles[name] = main;
				}
				else {
					grunt.fatal('Bower: can’t detect main file for "' + name + '" component.' +
						'You should add it manually to concat task and exclude from bower task build.');
				}
			});

			// Sort by dependencies
			var flatJsFiles = [];
			_.each(jsFiles, function(file, name) {
				flatJsFiles.push({name: name, file: file});
			});
			flatJsFiles.sort(function(a, b) {
				if (_.indexOf(dependencies[b.name], a.name) !== -1)
					return -1;
				else
					return 1;
			});

			// Return flat list of JS files
			allDone(_.pluck(flatJsFiles, 'file'));
		});
	}

	// Should be used inside grunt.util.async.parallel
	function bowerList(kind) {
		return function(callback) {
			var params = {};
			params[kind] = true;
			bower.commands.list(params)
				.on('error', grunt.fatal.bind(grunt.fail))
				.on('data', function(data) {
					callback(null, data);  // null means "no error" for async.parallel
				});
		};
	}

	function findMainFile(name, component) {
		// Bower knows main JS file?
		var mainFiles = ensureArray(component);
		var main = _.find(mainFiles, isJsFile);
		if (main) {
			return main;
		}

		// Try to find main JS file
		var jsFiles = grunt.file.expand(path.join(component, '*.js'));
		if (jsFiles.length === 1) {
			// Only one JS file: no doubt it’s main file
			return jsFiles[0];
		}
		else {
			// More than one JS file: try to guess
			return guessMainFile(name, jsFiles);
		}
	}

	// Computing Levenshtein distance to guess a main file
	// Based on https://github.com/curist/grunt-bower
	function guessMainFile(componentName, files) {
		var minDist = 1e13;
		var minDistIndex = -1;

		files.sort(function(a, b) {
			// Reverse order by path length
			return b.length - a.length;
		});

		files.forEach(function(filepath, i) {
			var filename = path.basename(filepath, '.js');
			var dist = levenshteinDistanceAux(componentName, filename);
			if (dist <= minDist) {
				minDist = dist;
				minDistIndex = i;
			}
		});

		if (minDistIndex !== -1) {
			return files[minDistIndex];
		}
		else {
			return undefined;
		}
	}

	// http://en.wikipedia.org/wiki/Levenshtein_distance#Computing_Levenshtein_distance
	// Borrowed from https://github.com/curist/grunt-bower
	function levenshteinDistanceAux(str1, str2) {
		var memo = {};

		function levenshteinDistance(str1, i, len1, str2, j, len2) {
			var key = [i, len1, j, len2].join(',');
			if (memo[key] !== undefined) {
				return memo[key];
			}

			if (len1 === 0) {
				return len2;
			}
			if (len2 === 0) {
				return len1;
			}
			
			var cost = 0;
			if (str1[i] !== str2[j]) {
				cost = 1;
			}

			var dist = Math.min(
				levenshteinDistance(str1, i+1, len1-1, str2, j, len2) + 1,
				levenshteinDistance(str1, i, len1, str2, j+1, len2-1) + 1,
				levenshteinDistance(str1, i+1, len1-1, str2, j+1, len2-1) + cost
			);
			memo[key] = dist;

			return dist;
		}

		return levenshteinDistance(str1, 0, str1.length, str2, 0, str2.length);
	}

	function isJsFile(filepath) {
		return typeof filepath === 'string' && path.extname(filepath) === '.js';
	}

	function ensureArray(object) {
		if (Array.isArray(object))
			return object;
		else
			return [object];
	}

};