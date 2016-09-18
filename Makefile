
JAVACFLAGS = -Xlint:all -Xlint:-serial -Werror

PLUGIN_NAMES = $(patsubst src/%,%,$(wildcard src/*))
PLUGIN_ARCHIVES = $(patsubst %,out/%.jar,$(PLUGIN_NAMES))

.PHONY: all clean
.SECONDARY:

all: $(PLUGIN_ARCHIVES)

build out:
	mkdir $@

build/%.jar: $(shell find src/$* -name '*.java' 2>/dev/null) | build
	cd src/$* && javac $(JAVACFLAGS) $$(find . -name '*.java')
	cd src/$* && jar cf ../../build/$*.jar $$(find . -name '*.class')

out/%.jar: build/%.jar $(shell find src/$* -type f 2>/dev/null) | out
	cp build/$*.jar out/$*.jar
	cd src/$* && jar ufm ../../out/$*.jar META-INF/MANIFEST.MF \
	2>/dev/null || true
	cd src/$* && jar uf ../../out/$*.jar $$(find . -type f -not \
	-path './META-INF/MANIFEST.MF')

clean:
	rm -rf build/ out/
