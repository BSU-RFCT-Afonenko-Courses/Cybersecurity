package course

// Public CourseNavigation registration, never author project/config data.
#PublicNavigationPlugin: close({
	name: "CourseNavigation"
	script: ["model.js", "ui.js", "plugin.js"]
	stylesheet: ["navigation.css"]
	config: close({
		scrollActivationWidth: 0
		courseNav: close({sidebar: bool})
	})
})
